/**
 * POST /api/admin/login
 * Rate-limited, bcrypt verified, issues JWT + CSRF cookies.
 * Credentials loaded from Secrets Manager via secrets.ts
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import {
  signAdminToken,
  generateCsrfToken,
  checkRateLimit,
  sanitizeText,
  securityHeaders,
} from '../../../lib/security';
import { getSecrets } from '../../../lib/secrets';

async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  const bcrypt = await import('bcryptjs');
  const lib = (bcrypt.default ?? bcrypt) as {
    compare: (a: string, b: string) => Promise<boolean>;
  };
  return lib.compare(plain, hash);
}

export const POST: APIRoute = async ({ request, redirect }) => {
  const headers = new Headers(securityHeaders());

  // Rate limit: 5 attempts per IP per 15 minutes
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rl = await checkRateLimit(`login:${ip}`, 5, 15 * 60_000);
  if (!rl.allowed) {
    headers.set('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
    return redirect('/admin?error=ratelimit', 303);
  }

  // Parse body
  let username = '';
  let password = '';
  const ct = request.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    const body = await request.json().catch(() => ({}));
    username = sanitizeText(String(body.username ?? '')).slice(0, 80);
    password = String(body.password ?? '').slice(0, 128);
  } else {
    const form = await request.formData().catch(() => new FormData());
    username = sanitizeText(String(form.get('username') ?? '')).slice(0, 80);
    password = String(form.get('password') ?? '').slice(0, 128);
  }

  // Load credentials from Secrets Manager (cached after first call)
  const secrets = await getSecrets();

  const usernameOk = username === secrets.adminUsername;
  const passwordOk = await verifyPassword(password, secrets.adminPasswordHash);

  if (!usernameOk || !passwordOk) {
    return redirect('/admin?error=invalid', 303);
  }

  const jwt       = await signAdminToken(username);
  const csrfToken = generateCsrfToken();
  // Secure now safe to set on both cookies — Lambda Function URL + CloudFront
  // means the client-facing connection is always HTTPS (unlike the old EC2
  // setup where CloudFront terminated TLS and forwarded plain HTTP to EC2).
  const cookieBase = 'Path=/; SameSite=Lax; Max-Age=28800; Secure';

  headers.append('Set-Cookie', `admin_token=${jwt}; ${cookieBase}; HttpOnly`);
  headers.append('Set-Cookie', `admin_csrf_token=${csrfToken}; ${cookieBase}`);
  headers.set('Location', '/admin/dashboard');

  return new Response(null, { status: 303, headers });
};
