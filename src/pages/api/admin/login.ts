/**
 * POST /api/admin/login
 * ─────────────────────────────────────────────────────────────────────────────
 * Authenticates the admin user.
 *
 * Security measures:
 *  • Rate-limited to 5 attempts per IP per 15 minutes
 *  • bcrypt password comparison (constant-time)
 *  • JWT issued as HttpOnly, Secure, SameSite=Strict cookie
 *  • CSRF token set as a readable (non-HttpOnly) cookie
 *  • All security headers applied
 *  • Intentionally vague error messages (no username enumeration)
 */

import type { APIRoute } from 'astro';
import {
  signAdminToken,
  generateCsrfToken,
  checkRateLimit,
  sanitizeText,
  securityHeaders,
} from '../../../lib/security';

// ── Credential check ──────────────────────────────────────────────────────────
// In production: load hashed password from AWS Secrets Manager / Parameter Store.
// NEVER hard-code real credentials — this is a placeholder pattern only.
const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? 'admin';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH ?? '$2a$12$AOrs0TMFNKfl4rhvdyqp8uOfw7XzCyyYxqHN/FkQpBXhhLVk9XQA6';

async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  const bcrypt = await import('bcryptjs');
  const lib = (bcrypt.default ?? bcrypt) as { compare: (a: string, b: string) => Promise<boolean> };
  return lib.compare(plain, hash);
}

// ── Route handler ─────────────────────────────────────────────────────────────
export const POST: APIRoute = async ({ request, redirect }) => {
  const headers = new Headers(securityHeaders());

  // ── Rate limit by IP ──────────────────────────────────────────────────────
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rl = checkRateLimit(`login:${ip}`, 5, 15 * 60_000);
  if (!rl.allowed) {
    headers.set('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
    return redirect('/admin?error=ratelimit', 303);
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let username = '';
  let password = '';

  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const body = await request.json().catch(() => ({}));
    username = sanitizeText(String(body.username ?? '')).slice(0, 80);
    password = String(body.password ?? '').slice(0, 128);
  } else {
    // HTML form submission (application/x-www-form-urlencoded)
    const form = await request.formData().catch(() => new FormData());
    username = sanitizeText(String(form.get('username') ?? '')).slice(0, 80);
    password = String(form.get('password') ?? '').slice(0, 128);
  }

  // ── Validate credentials ──────────────────────────────────────────────────
  const usernameOk = username === ADMIN_USERNAME;
  const passwordOk = await verifyPassword(password, ADMIN_PASSWORD_HASH);

  // Always run verifyPassword to prevent timing-based username enumeration.
  if (!usernameOk || !passwordOk) {
    return redirect('/admin?error=invalid', 303);
  }

  // ── Issue tokens ──────────────────────────────────────────────────────────
  const jwt        = await signAdminToken(username);
  const csrfToken  = generateCsrfToken();

  const cookieOpts = 'Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800';
  headers.append('Set-Cookie', `admin_token=${jwt}; ${cookieOpts}`);
  // CSRF token must NOT be HttpOnly so JS can read it for X-CSRF-Token header
  headers.append('Set-Cookie', `csrf_token=${csrfToken}; Path=/; Secure; SameSite=Strict; Max-Age=28800`);

  headers.set('Location', '/admin/dashboard');
  return new Response(null, { status: 303, headers });
};
