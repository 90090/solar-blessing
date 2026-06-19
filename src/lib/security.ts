import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

// ── Config ────────────────────────────────────────────────────────────────────

const JWT_ISSUER   = 'solar-blessing';
const JWT_AUDIENCE = 'solar-blessing-admin';

async function getJwtSecret(): Promise<Uint8Array> {
  if (process.env.SECRET_ARN) {
    const { getSecrets } = await import('./secrets');
    const s = await getSecrets();
    return new TextEncoder().encode(s.jwtSecret);
  }
  return new TextEncoder().encode(
    process.env.JWT_SECRET ?? 'dev-secret-replace-in-production-32chars'
  );
}

// ── Sanitization ──────────────────────────────────────────────────────────────
// Moved to sanitize.ts (zero dependencies, safe to import from browser-
// bundled components like ReviewForm.tsx). Re-exported here so existing
// server-side imports from './security' keep working unchanged.
export { sanitizeText, isValidEmail, sanitizeRating } from './sanitize';

// ── JWT ───────────────────────────────────────────────────────────────────────

export interface AdminPayload extends JWTPayload { role: 'admin'; }

export async function signAdminToken(adminId: string): Promise<string> {
  const secret = await getJwtSecret();
  return new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(adminId)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(secret);
}

export async function verifyAdminToken(token: string): Promise<AdminPayload> {
  const secret = await getJwtSecret();
  const { payload } = await jwtVerify(token, secret, {
    issuer:   JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
  if (payload.role !== 'admin') throw new Error('Unauthorized');
  return payload as AdminPayload;
}

export function getTokenFromCookies(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)admin_token=([^;]+)/);
  return match?.[1] ?? null;
}

// ── CSRF ──────────────────────────────────────────────────────────────────────

export function generateCsrfToken(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

export function verifyCsrfToken(
  cookieToken: string | null,
  headerToken: string | null
): boolean {
  if (!cookieToken || !headerToken) return false;
  if (cookieToken.length !== headerToken.length) return false;
  let result = 0;
  for (let i = 0; i < cookieToken.length; i++) {
    result |= cookieToken.charCodeAt(i) ^ headerToken.charCodeAt(i);
  }
  return result === 0;
}

// ── Rate limiter ──────────────────────────────────────────────────────────────
//
// On EC2 this was a single in-memory Map — fine, because there was exactly
// one process. On Lambda there can be many concurrent execution environments
// each with their own empty Map, so an in-memory limiter effectively stops
// limiting anything under real concurrency. This now lives in DynamoDB
// (the same single table everything else uses) so every concurrent Lambda
// invocation shares the same counters.
//
// Item shape (single-table design, reuses the existing table):
//   PK: "RATELIMIT#<key>"   SK: "WINDOW"
//   count: number
//   resetAt: number (epoch ms)
//   ttl: number (epoch seconds — DynamoDB TTL attribute, auto-deletes old rows)
//
// A conditional UpdateCommand with an atomic ADD handles the increment so
// concurrent requests racing for the same key don't lose counts.

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const TABLE  = process.env.DYNAMODB_TABLE ?? '';
const REGION = process.env.AWS_REGION ?? 'us-east-1';

let _ddb: DynamoDBDocumentClient | null = null;
function ddb(): DynamoDBDocumentClient {
  if (!_ddb) {
    _ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
  }
  return _ddb;
}

// In-memory fallback only used in local dev (no DYNAMODB_TABLE set), so
// `npm run dev` keeps working without AWS credentials — same dev-mode
// pattern db.ts already uses elsewhere in this codebase.
interface RateLimitEntry { count: number; resetAt: number; }
const devRateLimitStore = new Map<string, RateLimitEntry>();

function devCheckRateLimit(key: string, limit: number, windowMs: number) {
  const now   = Date.now();
  const entry = devRateLimitStore.get(key);
  if (!entry || now > entry.resetAt) {
    const resetAt = now + windowMs;
    devRateLimitStore.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }
  entry.count += 1;
  return {
    allowed:   entry.count <= limit,
    remaining: Math.max(0, limit - entry.count),
    resetAt:   entry.resetAt,
  };
}

export async function checkRateLimit(
  key: string,
  limit = 10,
  windowMs = 60_000
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  if (!TABLE) return devCheckRateLimit(key, limit, windowMs);

  const now = Date.now();
  const pk  = `RATELIMIT#${key}`;

  // Try to increment an existing, still-valid window.
  // ConditionExpression ensures we only hit this branch if resetAt is in
  // the future; if it's expired (or doesn't exist) this throws and we
  // fall through to starting a fresh window below.
  try {
    const result = await ddb().send(new UpdateCommand({
      TableName:                 TABLE,
      Key:                       { PK: pk, SK: 'WINDOW' },
      UpdateExpression:          'SET #c = #c + :one',
      ConditionExpression:       'attribute_exists(PK) AND resetAt > :now',
      ExpressionAttributeNames:  { '#c': 'count' },
      ExpressionAttributeValues: { ':one': 1, ':now': now },
      ReturnValues:              'ALL_NEW',
    }));
    const count   = (result.Attributes?.count as number) ?? limit + 1;
    const resetAt = (result.Attributes?.resetAt as number) ?? now;
    return {
      allowed:   count <= limit,
      remaining: Math.max(0, limit - count),
      resetAt,
    };
  } catch {
    // No active window — start a new one. PutCommand-via-Update so we
    // don't clobber a window that another concurrent request just created
    // (the ConditionExpression on PK protects against double-init races;
    // if we lose that race, just allow this one request as a tradeoff for
    // simplicity, the next one will recheck against the real window).
    const resetAt = now + windowMs;
    const ttl     = Math.floor((resetAt + windowMs) / 1000); // expire well after window closes
    try {
      await ddb().send(new UpdateCommand({
        TableName:                 TABLE,
        Key:                       { PK: pk, SK: 'WINDOW' },
        UpdateExpression:          'SET #c = :one, resetAt = :resetAt, #t = :ttl',
        ConditionExpression:       'attribute_not_exists(PK) OR resetAt <= :now',
        ExpressionAttributeNames:  { '#c': 'count', '#t': 'ttl' },
        ExpressionAttributeValues: { ':one': 1, ':resetAt': resetAt, ':ttl': ttl, ':now': now },
      }));
    } catch {
      // Lost the init race — another request initialized it first.
      // Fail open for this single request rather than erroring the user out.
    }
    return { allowed: true, remaining: limit - 1, resetAt };
  }
}

// ── Security headers ──────────────────────────────────────────────────────────

export function securityHeaders(): Record<string, string> {
  return {
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "connect-src 'self'",
      "img-src 'self' data:",
      "frame-ancestors 'none'",
    ].join('; '),
    'X-Content-Type-Options':  'nosniff',
    'X-Frame-Options':         'DENY',
    'X-XSS-Protection':        '1; mode=block',
    'Referrer-Policy':         'strict-origin-when-cross-origin',
    'Permissions-Policy':      'camera=(), microphone=(), geolocation=()',
  };
}

// ── CORS (public API only) ─────────────────────────────────────────────────
//
// Needed because the kombucha/sobolo/salve pages now live on DreamHost
// (e.g. https://solarblessing.com) while this API runs on a different
// origin (e.g. https://api.solarblessing.com) — different subdomains count
// as different origins for CORS/cookie purposes. credentials:'include' on
// the browser's fetch() calls plus this header pair is what lets the
// cross-origin cookie (csrf_token, set by /api/csrf) actually get sent back.
//
// Access-Control-Allow-Origin must be the EXACT origin, not '*' — browsers
// reject wildcard origins on credentialed requests outright. Set
// ALLOWED_ORIGIN as a Lambda environment variable to your DreamHost domain.
//
// Only call this from routes the static DreamHost pages actually call:
// GET/POST /api/reviews, GET /api/posts, GET /api/events, GET /api/csrf.
// Admin routes don't need this — the admin UI is same-origin to this Lambda.
export function corsHeaders(): Record<string, string> {
  const origin = process.env.ALLOWED_ORIGIN ?? '';
  return {
    'Access-Control-Allow-Origin':      origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods':     'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers':     'Content-Type, X-CSRF-Token',
    'Vary':                             'Origin',
  };
}
