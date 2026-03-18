/**
 * GET  /api/admin/posts   — list posts (filterable by status)
 * POST /api/admin/posts   — create a new post (admin only, auto-approved)
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireAdmin, JSON_HEADERS } from '../../../../lib/adminAuth';
import { sanitizeText } from '../../../../lib/security';

const PostSchema = z.object({
  title:   z.string().min(1).max(200),
  excerpt: z.string().max(400).optional().default(''),
  body:    z.string().min(1).max(8000),
});

async function fetchPosts(status?: string) {
  const apiUrl = process.env.API_BASE_URL;
  if (!apiUrl) {
    return [
      { id:'p1', title:'Spring Batch: New Ginger Turmeric Kombucha!', excerpt:'We\'re excited to announce a new seasonal flavour…', body:'Full post here.', status:'approved', createdAt: new Date().toISOString() },
    ].filter(p => !status || p.status === status);
  }
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  const res = await fetch(`${process.env.API_BASE_URL}/admin/posts${qs}`, {
    headers: { 'x-api-key': process.env.API_KEY ?? '' },
  });
  return res.json();
}

async function createPost(data: z.infer<typeof PostSchema>) {
  const apiUrl = process.env.API_BASE_URL;
  if (!apiUrl) {
    const post = { id:`p${Date.now()}`, ...data, status:'approved', createdAt: new Date().toISOString() };
    console.log('[DEV] Created post:', post);
    return post;
  }
  const res = await fetch(`${apiUrl}/admin/posts`, {
    method:  'POST',
    headers: { 'Content-Type':'application/json', 'x-api-key': process.env.API_KEY ?? '' },
    body:    JSON.stringify({ ...data, status:'approved' }),
  });
  if (!res.ok) throw new Error(`Backend ${res.status}`);
  return res.json();
}

export const GET: APIRoute = async ({ request }) => {
  const headers = JSON_HEADERS();
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.error!;

  const status = new URL(request.url).searchParams.get('status') ?? undefined;
  try {
    return new Response(JSON.stringify(await fetchPosts(status)), { status: 200, headers });
  } catch (err) {
    return new Response(JSON.stringify({ message: 'Failed to fetch posts' }), { status: 500, headers });
  }
};

export const POST: APIRoute = async ({ request }) => {
  const headers = JSON_HEADERS();
  const auth = await requireAdmin(request, true);
  if (!auth.ok) return auth.error!;

  let body: unknown;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ message: 'Invalid JSON' }), { status: 400, headers }); }

  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ message: parsed.error.errors.map(e=>e.message).join(', ') }), { status: 422, headers });
  }

  const safe = {
    title:   sanitizeText(parsed.data.title),
    excerpt: sanitizeText(parsed.data.excerpt ?? ''),
    body:    sanitizeText(parsed.data.body),
  };

  try {
    const post = await createPost(safe);
    return new Response(JSON.stringify(post), { status: 201, headers });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ message: 'Failed to create post' }), { status: 500, headers });
  }
};
