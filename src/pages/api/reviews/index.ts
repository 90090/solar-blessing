/**
 * GET /api/reviews?product=kombucha|sobolo|salve
 * ─────────────────────────────────────────────────────────────────────────────
 * Public endpoint — returns approved reviews for a given product.
 * Called by ProductLayout.astro at SSR time to hydrate review lists.
 *
 * Email is NEVER returned; it is stripped server-side before this
 * response is built.
 */

import type { APIRoute } from 'astro';
import { securityHeaders } from '../../../lib/security';

const VALID_PRODUCTS = new Set(['kombucha', 'sobolo', 'salve']);

const JSON_HEADERS = () =>
  new Headers({ 'Content-Type': 'application/json', ...securityHeaders() });

async function getApprovedReviews(product: string) {
  const apiUrl = process.env.API_BASE_URL;

  if (!apiUrl) {
    // ── Dev stubs ────────────────────────────────────────────────────────────
    const stubs: Record<string, object[]> = {
      kombucha: [
        { id: 'r1', product: 'kombucha', name: 'Sarah M.', rating: 5, body: 'Absolutely love it! Tastes incredible and my gut health has noticeably improved.', createdAt: new Date(Date.now() - 86400000 * 3).toISOString() },
        { id: 'r4', product: 'kombucha', name: 'Priya T.', rating: 4, body: 'Great flavour and I love that it\'s locally made. The ginger kick is perfect.', createdAt: new Date(Date.now() - 86400000 * 7).toISOString() },
      ],
      sobolo: [
        { id: 'r5', product: 'sobolo', name: 'Ama K.', rating: 5, body: 'Refreshing and not too sweet. Reminds me of home — exactly what I was looking for.', createdAt: new Date(Date.now() - 86400000 * 2).toISOString() },
      ],
      salve: [
        { id: 'r2', product: 'salve', name: 'Mike R.', rating: 5, body: 'Healed my cracked winter hands in less than a week. Nothing else has ever worked this well.', createdAt: new Date(Date.now() - 86400000).toISOString() },
        { id: 'r6', product: 'salve', name: 'Jordan L.', rating: 5, body: 'I\'m a chef and my hands take a beating every day. This salve is a lifesaver — quite literally.', createdAt: new Date(Date.now() - 86400000 * 5).toISOString() },
      ],
    };
    return stubs[product] ?? [];
  }

  // ── Production: fetch from AWS API Gateway → Lambda → DynamoDB ─────────────
  const res = await fetch(
    `${apiUrl}/reviews?product=${encodeURIComponent(product)}&status=approved`,
    { headers: { 'x-api-key': process.env.API_KEY ?? '' } }
  );
  if (!res.ok) throw new Error(`Backend ${res.status}`);
  const items = await res.json() as Array<Record<string, unknown>>;

  // Defensive strip of email in case backend returns it (should never happen)
  return items.map(({ email: _dropped, ...safe }) => safe);
}

export const GET: APIRoute = async ({ request }) => {
  const headers = JSON_HEADERS();

  const url     = new URL(request.url);
  const product = url.searchParams.get('product') ?? '';

  if (!VALID_PRODUCTS.has(product)) {
    return new Response(
      JSON.stringify({ message: 'Invalid product. Must be kombucha, sobolo, or salve.' }),
      { status: 400, headers }
    );
  }

  try {
    const reviews = await getApprovedReviews(product);
    // Cache approved reviews for 60 seconds at the CDN layer
    headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    return new Response(JSON.stringify(reviews), { status: 200, headers });
  } catch (err) {
    console.error('Failed to fetch reviews:', err);
    return new Response(
      JSON.stringify({ message: 'Could not load reviews.' }),
      { status: 500, headers }
    );
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/reviews — submit a new review (public, rate-limited, CSRF-checked)
// ─────────────────────────────────────────────────────────────────────────────
import { z } from 'zod';
import {
  sanitizeText,
  isValidEmail,
  sanitizeRating,
  verifyCsrfToken,
  checkRateLimit,
} from '../../../lib/security';

const ReviewSchema = z.object({
  product: z.enum(['kombucha', 'sobolo', 'salve']),
  name:    z.string().min(1).max(80),
  email:   z.string().email().max(254),
  body:    z.string().min(10).max(1000),
  rating:  z.number().int().min(1).max(5),
});

async function saveReview(data: z.infer<typeof ReviewSchema>) {
  const apiUrl = process.env.API_BASE_URL;
  if (!apiUrl) {
    console.log('[DEV] New review pending approval:', { ...data, email: '[REDACTED]' });
    return { id: `dev-${Date.now()}` };
  }
  const res = await fetch(`${apiUrl}/reviews`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.API_KEY ?? '' },
    body:    JSON.stringify({ ...data, status: 'pending' }),
  });
  if (!res.ok) throw new Error(`Backend ${res.status}`);
  return res.json() as Promise<{ id: string }>;
}

export const POST: APIRoute = async ({ request }) => {
  const headers = JSON_HEADERS();

  // Rate limit: 10 submissions per IP per hour
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rl = checkRateLimit(`review:${ip}`, 10, 60 * 60_000);
  if (!rl.allowed) {
    headers.set('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
    return new Response(JSON.stringify({ message: 'Too many requests. Try again later.' }), { status: 429, headers });
  }

  // CSRF check
  const cookieCsrf = request.headers.get('cookie')?.match(/csrf_token=([^;]+)/)?.[1] ?? null;
  const headerCsrf = request.headers.get('x-csrf-token');
  if (!verifyCsrfToken(cookieCsrf, headerCsrf)) {
    return new Response(JSON.stringify({ message: 'Invalid request token.' }), { status: 403, headers });
  }

  // Parse + validate
  let body: unknown;
  try   { body = await request.json(); }
  catch { return new Response(JSON.stringify({ message: 'Invalid JSON.' }), { status: 400, headers }); }

  const parsed = ReviewSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.errors.map(e => e.message).join(', ');
    return new Response(JSON.stringify({ message: msg }), { status: 422, headers });
  }

  const d = parsed.data;
  if (!isValidEmail(d.email)) {
    return new Response(JSON.stringify({ message: 'Invalid email address.' }), { status: 422, headers });
  }

  const safe = {
    product: d.product,
    name:    sanitizeText(d.name),
    email:   d.email.toLowerCase().trim(),
    body:    sanitizeText(d.body),
    rating:  sanitizeRating(d.rating) as 1 | 2 | 3 | 4 | 5,
  };

  try {
    const result = await saveReview(safe);
    return new Response(
      JSON.stringify({ id: result.id, message: 'Review submitted for approval.' }),
      { status: 201, headers }
    );
  } catch (err) {
    console.error('Review save failed:', err);
    return new Response(JSON.stringify({ message: 'Could not save review. Please try again.' }), { status: 500, headers });
  }
};
