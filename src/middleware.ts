import { defineMiddleware } from 'astro:middleware';
import {
  verifyAdminToken,
  getTokenFromCookies,
  generateCsrfToken,
  securityHeaders,
} from './lib/security';

const PUBLIC_ADMIN_PAGES = new Set(['/admin', '/admin/']);

// All pages that need a CSRF cookie (product pages + admin dashboard)
const CSRF_PAGES = new Set(['/kombucha', '/sobolo', '/salve', '/admin/dashboard', '/admin/']);

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  // ── 1. Guard /admin/* pages ───────────────────────────────────────────────
  if (pathname.startsWith('/admin') && !PUBLIC_ADMIN_PAGES.has(pathname)) {
    const token = getTokenFromCookies(context.request.headers.get('cookie'));
    if (!token) return context.redirect('/admin?error=session');
    try {
      await verifyAdminToken(token);
    } catch {
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

  // ── 3. Set CSRF cookie on pages that need it (before headers flush) ────────
  // Also set on all admin pages so the dashboard always has a token
  const needsCsrf = CSRF_PAGES.has(pathname) || pathname.startsWith('/admin');
  if (needsCsrf) {
    const existing = context.cookies.get('csrf_token')?.value;
    if (!existing) {
      context.cookies.set('csrf_token', generateCsrfToken(), {
        httpOnly: false,  // JS must read it for X-CSRF-Token header
        secure:   false,  // CloudFront terminates SSL — EC2 sees HTTP internally
        sameSite: 'lax',  // 'strict' can block cookie on CF redirect; lax is safe
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
