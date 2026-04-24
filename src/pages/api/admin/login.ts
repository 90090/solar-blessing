/**
 * POST /api/admin/login
 * Rate-limited, bcrypt verified, issues JWT + CSRF cookies.
 */
import type { APIRoute } from 'astro';
import {
  signAdminToken,
  generateCsrfToken,
  checkRateLimit,
  sanitizeText,
  securityHeaders,
} from '../../../lib/security';

const ADMIN_USERNAME     = process.env.ADMIN_USERNAME ?? 'admin';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH ?? '$2a$12$uXNA89Vt1VgkBRs1VDFKQOOpz8eTHW3OppArYPPSeGFeuOiV8LeRK';

async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!hash || hash.startsWith('REPLACE')) return false;
  const bcrypt = await import('bcryptjs');
  const lib = (bcrypt.default ?? bcrypt) as { compare: (a: string, b: string) => Promise<boolean> };
  return lib.compare(plain, hash);
}

export const POST: APIRoute = async ({ request, redirect }) => {
  const headers = new Headers(securityHeaders());

  // Rate limit: 5 attempts per IP per 15 minutes
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rl = checkRateLimit(`login:${ip}`, 5, 15 * 60_000);
  if (!rl.allowed) {
    headers.set('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
    return redirect('/admin?error=ratelimit', 303);
  }

  // Parse body (supports both form POST and JSON)
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

  const usernameOk = username === ADMIN_USERNAME;
  const passwordOk = await verifyPassword(password, ADMIN_PASSWORD_HASH);

  if (!usernameOk || !passwordOk) {
    return redirect('/admin?error=invalid', 303);
  }

  // Issue JWT cookie
  const jwt       = await signAdminToken(username);
  const csrfToken = generateCsrfToken();
  // Note: No Secure flag — CloudFront terminates SSL, EC2 sees HTTP internally
  // SameSite=Lax instead of Strict so cookie survives CloudFront redirects
  const cookieBase = 'Path=/; SameSite=Lax; Max-Age=28800';

  headers.append('Set-Cookie', `admin_token=${jwt}; ${cookieBase}; HttpOnly`);
  // CSRF must NOT be HttpOnly — JS reads it for X-CSRF-Token header
  headers.append('Set-Cookie', `csrf_token=${csrfToken}; ${cookieBase}`);
  headers.set('Location', '/admin/dashboard');

  return new Response(null, { status: 303, headers });
};
