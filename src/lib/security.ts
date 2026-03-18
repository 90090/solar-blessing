/**
 * security.ts
 * ────────────────────────────────────────────────────────────────────────────
 * Central security utilities for Solar Blessing.
 *
 * Covers:
 *  • Input sanitization  (XSS / HTML injection prevention)
 *  • JWT creation / verification  (admin sessions)
 *  • CSRF token helpers
 *  • Rate-limit helpers  (in-memory; swap for Redis in production)
 *  • Strict HTTP-security headers
 * ────────────────────────────────────────────────────────────────────────────
 */

import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

// ─── Environment ─────────────────────────────────────────────────────────────
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'REPLACE_WITH_STRONG_SECRET_IN_ENV'
);
const JWT_ISSUER   = 'solar-blessing';
const JWT_AUDIENCE = 'solar-blessing-admin';
const JWT_EXPIRY   = '8h';

// ─── Sanitization ─────────────────────────────────────────────────────────────

/**
 * Strip ALL HTML tags and dangerous characters from a plain-text field.
 * Use this for names, titles, short text.
 */
export function sanitizeText(raw: string): string {
  return raw
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .replace(/`/g, '&#x60;')
    .trim()
    .slice(0, 4096); // hard length cap
}

/**
 * Sanitize a URL — only allow http/https schemes to block javascript: URIs.
 */
export function sanitizeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return url.toString();
  } catch {
    return '';
  }
}

/**
 * Validate an email address (basic RFC-compliant check).
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(email);
}

/**
 * Sanitize star rating — must be integer 1–5.
 */
export function sanitizeRating(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 5) throw new Error('Invalid rating');
  return n;
}

// ─── JWT ──────────────────────────────────────────────────────────────────────

export interface AdminPayload extends JWTPayload {
  role: 'admin';
}

export async function signAdminToken(adminId: string): Promise<string> {
  return new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(adminId)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRY)
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
  return match ? match[1] : null;
}

// ─── CSRF ─────────────────────────────────────────────────────────────────────

export function generateCsrfToken(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function verifyCsrfToken(cookieToken: string | null, headerToken: string | null): boolean {
  if (!cookieToken || !headerToken) return false;
  // Constant-time compare to prevent timing attacks
  if (cookieToken.length !== headerToken.length) return false;
  let result = 0;
  for (let i = 0; i < cookieToken.length; i++) {
    result |= cookieToken.charCodeAt(i) ^ headerToken.charCodeAt(i);
  }
  return result === 0;
}

// ─── Rate limiter (in-memory) ─────────────────────────────────────────────────
// For production, replace with a Redis-backed solution (e.g., @upstash/ratelimit).

interface RateLimitEntry { count: number; resetAt: number; }
const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * @param key       IP address or user identifier
 * @param limit     max requests per window
 * @param windowMs  rolling window in milliseconds
 */
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
  const remaining = Math.max(0, limit - entry.count);
  return { allowed: entry.count <= limit, remaining, resetAt: entry.resetAt };
}

// ─── HTTP Security Headers ────────────────────────────────────────────────────

export function securityHeaders(): Record<string, string> {
  return {
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",    // tighten to nonce in production
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
    'X-Content-Type-Options':    'nosniff',
    'X-Frame-Options':           'DENY',
    'X-XSS-Protection':          '1; mode=block',
    'Referrer-Policy':           'strict-origin-when-cross-origin',
    'Permissions-Policy':        'camera=(), microphone=(), geolocation=()',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  };
}
