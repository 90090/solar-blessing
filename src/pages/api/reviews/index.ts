export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getReviews, createReview } from '../../../lib/db';
import { sanitizeText, isValidEmail, sanitizeRating, verifyCsrfToken, checkRateLimit, securityHeaders, corsHeaders } from '../../../lib/security';

// Both routes get CORS headers — this is called cross-origin from the
// DreamHost-hosted product pages (a different origin from this Lambda).
const H = () => new Headers({ 'Content-Type': 'application/json', ...securityHeaders(), ...corsHeaders() });

const ReviewSchema = z.object({
  product: z.enum(['kombucha', 'sobolo', 'salve']),
  name:    z.string().min(1).max(80),
  email:   z.string().email().max(254),
  body:    z.string().min(10).max(1000),
  rating:  z.number().int().min(1).max(5),
});

export const GET: APIRoute = async ({ request }) => {
  const headers = H();
  const product = new URL(request.url).searchParams.get('product') ?? '';
  if (!['kombucha','sobolo','salve'].includes(product))
    return new Response(JSON.stringify({ message: 'Invalid product' }), { status: 400, headers });
  try {
    const reviews = await getReviews('approved', product);
    headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    return new Response(JSON.stringify(reviews), { status: 200, headers });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ message: 'Could not load reviews' }), { status: 500, headers });
  }
};

export const POST: APIRoute = async ({ request }) => {
  const headers = H();

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  // checkRateLimit is now async — it round-trips to DynamoDB instead of an
  // in-memory Map, since Lambda has no single shared process to hold state in.
  const rl = await checkRateLimit(`review:${ip}`, 10, 3600_000);
  if (!rl.allowed) return new Response(JSON.stringify({ message: 'Too many requests.' }), { status: 429, headers });

  // A browser can send MORE THAN ONE csrf_token cookie at once — e.g. a stale
  // host-only cookie (api.solarblessings.com) left over from a previous deploy
  // PLUS the current domain-scoped one (.solarblessings.com). A single-match
  // regex grabs whichever comes first and can pick the wrong (stale) one,
  // causing a spurious 403. So collect ALL csrf_token values and accept the
  // request if ANY of them matches the header token.
  const headerCsrf = request.headers.get('x-csrf-token');
  const cookieHeader = request.headers.get('cookie') ?? '';
  const cookieTokens = [...cookieHeader.matchAll(/csrf_token=([^;]+)/g)].map(m => m[1]);
  const csrfOk = !!headerCsrf && cookieTokens.some(t => verifyCsrfToken(t, headerCsrf));
  if (!csrfOk)
    return new Response(JSON.stringify({ message: 'Invalid request token.' }), { status: 403, headers });

  let body: unknown;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ message: 'Invalid JSON' }), { status: 400, headers }); }

  const parsed = ReviewSchema.safeParse(body);
  if (!parsed.success)
    return new Response(JSON.stringify({ message: parsed.error.errors.map(e => e.message).join(', ') }), { status: 422, headers });

  const d = parsed.data;
  if (!isValidEmail(d.email))
    return new Response(JSON.stringify({ message: 'Invalid email' }), { status: 422, headers });

  try {
    const id = await createReview({
      product: d.product,
      name:    sanitizeText(d.name),
      email:   d.email.toLowerCase().trim(),
      body:    sanitizeText(d.body),
      rating:  sanitizeRating(d.rating) as 1|2|3|4|5,
    });
    return new Response(JSON.stringify({ id, message: 'Review submitted for approval.' }), { status: 201, headers });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ message: 'Could not save review.' }), { status: 500, headers });
  }
};

// CORS preflight — required because POST requests here carry a custom
// X-CSRF-Token header, which forces the browser to preflight even though
// the method itself (POST) wouldn't otherwise require one.
export const OPTIONS: APIRoute = async () => {
  return new Response(null, { status: 204, headers: corsHeaders() });
};