export const prerender = false;

import type { APIRoute } from 'astro';
import { generateCsrfToken, securityHeaders, corsHeaders } from '../../lib/security';

// GET /api/csrf
//
// In the old single-origin setup, Astro middleware set the csrf_token
// cookie server-side on every page render (see middleware.ts). Now that the
// product pages (kombucha/sobolo/salve) are static HTML served from
// DreamHost — served from the apex (solarblessings.com) while this Lambda is
// on a subdomain (api.solarblessings.com) — there's no middleware running on
// those page loads to set anything, so this endpoint sets it instead.
//
// COOKIE STRATEGY — why Domain + SameSite=Lax, not SameSite=None:
// The page (solarblessings.com) and the API (api.solarblessings.com) are
// different ORIGINS but share the same registrable parent domain
// (solarblessings.com). A SameSite=None cookie would technically work, but
// browsers treat api.* as a THIRD PARTY relative to the apex page, and
// Firefox's Enhanced Tracking Protection + Safari's ITP block third-party
// cookies by default — so the cookie silently fails to send on the POST.
//
// Setting Domain=.solarblessings.com makes the cookie belong to the shared
// parent, so the browser considers solarblessings.com → api.solarblessings.com
// SAME-SITE (not third-party). That lets SameSite=Lax send it on the
// cross-subdomain POST WITHOUT depending on third-party cookie permission —
// much more robust than SameSite=None.
//
// COOKIE_DOMAIN must be set in the Lambda env (e.g. ".solarblessings.com").
// Leading dot = valid for the domain and all its subdomains. If it's unset
// (e.g. local dev on localhost where there's no shared parent), we fall back
// to a host-only SameSite=Lax cookie, which works same-origin in dev.
export const GET: APIRoute = async () => {
  const token = generateCsrfToken();
  const headers = new Headers({ ...securityHeaders(), ...corsHeaders() });
  headers.set('Content-Type', 'application/json');

  const cookieDomain = process.env.COOKIE_DOMAIN; // e.g. ".solarblessings.com"
  const domainAttr = cookieDomain ? `Domain=${cookieDomain}; ` : '';
  headers.append(
    'Set-Cookie',
    `csrf_token=${token}; Path=/; ${domainAttr}SameSite=Lax; Secure; Max-Age=3600`,
  );

  return new Response(JSON.stringify({ csrfToken: token }), { status: 200, headers });
};

// Browsers send a CORS preflight OPTIONS request before any cross-origin
// GET/POST that includes a custom header (X-CSRF-Token triggers this) —
// without this handler, the preflight gets Astro's default 404 and the
// browser blocks the real request before it's even sent.
export const OPTIONS: APIRoute = async () => {
  return new Response(null, { status: 204, headers: corsHeaders() });
};