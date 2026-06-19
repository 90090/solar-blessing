import { defineMiddleware } from 'astro:middleware';
import {
  verifyAdminToken,
  getTokenFromCookies,
  generateCsrfToken,
  securityHeaders,
} from './lib/security';

const PUBLIC_ADMIN_PAGES = new Set(['/admin', '/admin/']);

// Admin pages are still served by this same Lambda, so they're same-origin —
// the cookie set here only needs SameSite=Lax. The product pages
// (kombucha/sobolo/salve) moved to static HTML on DreamHost, a different
// origin, so they get their CSRF token from GET /api/csrf instead (which
// uses SameSite=None, since that's required for cross-origin cookies) —
// see src/pages/api/csrf.ts.
const CSRF_PAGES = new Set(['/admin/dashboard', '/admin/']);

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  // ── 0. Reject requests that didn't come through CloudFront ────────────────
  // The Lambda Permission's source_arn restricts which CloudFront
  // *distribution* is allowed to invoke this function via IAM, but that
  // doesn't stop someone from calling the raw *.lambda-url.<region>.on.aws
  // hostname directly over the public internet — Function URLs with
  // authorization_type = NONE are public by design. CloudFront injects this
  // header on every request it forwards; its absence (or a wrong value)
  // means the request bypassed CloudFront entirely.
  const originSecret = process.env.ORIGIN_VERIFY_SECRET;
  if (originSecret) {
    const got = context.request.headers.get('x-origin-verify');
    if (got !== originSecret) {
      return new Response('Not found', { status: 404 });
    }
  }

  // ── 1. Guard /admin/* pages ───────────────────────────────────────────────
  if (pathname.startsWith('/admin') && !PUBLIC_ADMIN_PAGES.has(pathname)) {
    const token = getTokenFromCookies(context.request.headers.get('cookie'));
    if (!token) return context.redirect('/admin?error=session');
    try {
      await verifyAdminToken(token);
    } catch (err) {
      console.error('ADMIN PAGE JWT verify failed:', err);
      return context.redirect('/admin?error=session');
    }
  }

  // ── 2. Guard /api/admin/* routes ──────────────────────────────────────────
  if (pathname.startsWith('/api/admin') && pathname !== '/api/admin/login') {
    const token = getTokenFromCookies(context.request.headers.get('cookie'));
    if (!token) {
      return new Response(JSON.stringify({ message: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    try {
      await verifyAdminToken(token);
    } catch {
      return new Response(JSON.stringify({ message: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // ── 3. Set CSRF cookie on admin pages (same-origin, SameSite=Lax) ──────────
  // Named distinctly from the public csrf_token cookie issued by
  // /api/csrf (SameSite=None, used cross-origin from the DreamHost-hosted
  // product pages) so the two never get confused or overwrite each other.
  const needsCsrf = CSRF_PAGES.has(pathname) || pathname.startsWith('/admin');
  if (needsCsrf) {
    const existing = context.cookies.get('admin_csrf_token')?.value;
    if (!existing) {
      context.cookies.set('admin_csrf_token', generateCsrfToken(), {
        httpOnly: false,  // JS must read it for X-CSRF-Token header
        secure:   true,   // Lambda Function URL + CloudFront — client always sees HTTPS
        sameSite: 'lax',  // same-origin admin UI — 'strict' can block cookie on CF redirect; lax is safe
        path:     '/',
        maxAge:   3600,
      });
    }
  }

  // ── 4. Apply security headers to every response ───────────────────────────
  const response = await next();
  Object.entries(securityHeaders()).forEach(([k, v]) => {
    if (!response.headers.has(k)) response.headers.set(k, v);
  });

  return response;
});
