import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

// ── Config ────────────────────────────────────────────────────────────────────

const JWT_SECRET  = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'dev-secret-replace-in-production-32chars'
);
const JWT_ISSUER   = 'solar-blessing';
const JWT_AUDIENCE = 'solar-blessing-admin';

// ── Sanitization ──────────────────────────────────────────────────────────────

export function sanitizeText(raw: string): string {
  return String(raw)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#x27;')
    .replace(/\//g, '&#x2F;')
    .trim()
    .slice(0, 4096);
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(email);
}

export function sanitizeRating(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 5) throw new Error('Invalid rating');
  return n;
}

// ── JWT ───────────────────────────────────────────────────────────────────────

export interface AdminPayload extends JWTPayload { role: 'admin'; }

export async function signAdminToken(adminId: string): Promise<string> {
  return new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(adminId)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(JWT_SECRET);
}

export async function verifyAdminToken(token: string): Promise<AdminPayload> {
  const { payload } = await jwtVerify(token, JWT_SECRET, {
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

// ── Rate limiter (in-memory) ──────────────────────────────────────────────────

interface RateLimitEntry { count: number; resetAt: number; }
const rateLimitStore = new Map<string, RateLimitEntry>();

export function checkRateLimit(
  key: string,
  limit = 10,
  windowMs = 60_000
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(key);
  if (!entry || now > entry.resetAt) {
    const resetAt = now + windowMs;
    rateLimitStore.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }
  entry.count += 1;
  return {
    allowed:   entry.count <= limit,
    remaining: Math.max(0, limit - entry.count),
    resetAt:   entry.resetAt,
  };
}

// ── HTTP security headers ─────────────────────────────────────────────────────

export function securityHeaders(): Record<string, string> {
  return {
    'X-Content-Type-Options':    'nosniff',
    'X-Frame-Options':           'DENY',
    'X-XSS-Protection':          '1; mode=block',
    'Referrer-Policy':           'strict-origin-when-cross-origin',
    'Permissions-Policy':        'camera=(), microphone=(), geolocation=()',
  };
}
