import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getReviews, createReview } from '../../../lib/db';
import { sanitizeText, isValidEmail, sanitizeRating, verifyCsrfToken, checkRateLimit, securityHeaders } from '../../../lib/security';

const H = () => new Headers({ 'Content-Type': 'application/json', ...securityHeaders() });

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
  const rl = checkRateLimit(`review:${ip}`, 10, 3600_000);
  if (!rl.allowed) return new Response(JSON.stringify({ message: 'Too many requests.' }), { status: 429, headers });

  const cookieCsrf = request.headers.get('cookie')?.match(/csrf_token=([^;]+)/)?.[1] ?? null;
  const headerCsrf = request.headers.get('x-csrf-token');
  if (!verifyCsrfToken(cookieCsrf, headerCsrf))
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
