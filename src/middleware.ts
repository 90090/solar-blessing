/**
 * src/middleware.ts
 * Runs on every request BEFORE any page/route handler.
 *
 * Responsibilities:
 *  1. Generate + set CSRF cookie on product pages (before headers flush)
 *  2. Protect all /admin/* pages
 *  3. Protect all /api/admin/* routes
 *  4. Apply global security headers to every response
 */

import { defineMiddleware } from 'astro:middleware';
import {
  verifyAdminToken,
  getTokenFromCookies,
  generateCsrfToken,
  securityHeaders,
} from './lib/security';

const PUBLIC_ADMIN_PAGES = new Set(['/admin', '/admin/']);

// Product pages that need a CSRF cookie for the review form
const PRODUCT_PAGES = new Set(['/kombucha', '/sobolo', '/salve']);

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  // ── 1. Guard /admin/* pages (before next()) so redirect fires cleanly ──────
  if (pathname.startsWith('/admin') && !PUBLIC_ADMIN_PAGES.has(pathname)) {
    const token = getTokenFromCookies(context.request.headers.get('cookie'));
    if (!token) return context.redirect('/admin?error=session');
    try {
      await verifyAdminToken(token);
    } catch {
      return context.redirect('/admin?error=session');
    }
  }

  // ── 2. Guard /api/admin/* routes (before next()) ───────────────────────────
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

  // ── 3. Inject CSRF cookie on product pages BEFORE headers are sent ─────────
  // We set it on context.cookies here so it goes out in the same response
  // flush as the page — avoids "response already sent" errors.
  if (PRODUCT_PAGES.has(pathname)) {
    const existing = context.cookies.get('csrf_token')?.value;
    if (!existing) {
      context.cookies.set('csrf_token', generateCsrfToken(), {
        httpOnly: false,   // JS must read it for X-CSRF-Token header
        secure:   import.meta.env.PROD,
        sameSite: 'strict',
        path:     '/',
        maxAge:   3600,
      });
    }
  }

  // ── 4. Run the route handler, then apply security headers ─────────────────
  const response = await next();
  Object.entries(securityHeaders()).forEach(([k, v]) => {
    if (!response.headers.has(k)) response.headers.set(k, v);
  });

  return response;
});
