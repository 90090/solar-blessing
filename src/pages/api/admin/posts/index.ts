import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireAdmin, JSON_HEADERS } from '../../../../lib/adminAuth';
import { getPosts, createPost } from '../../../../lib/db';
import { sanitizeText } from '../../../../lib/security';

const PostSchema = z.object({
  title:   z.string().min(1).max(200),
  excerpt: z.string().max(400).default(''),
  body:    z.string().min(1).max(8000),
});

export const GET: APIRoute = async ({ request }) => {
  const headers = JSON_HEADERS();
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.error!;
  const status = new URL(request.url).searchParams.get('status') ?? undefined;
  try {
    return new Response(JSON.stringify(await getPosts(status)), { status: 200, headers });
  } catch (err) {
    console.error(err);
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
  if (!parsed.success)
    return new Response(JSON.stringify({ message: parsed.error.errors.map(e => e.message).join(', ') }), { status: 422, headers });
  try {
    const post = await createPost({
      title:   sanitizeText(parsed.data.title),
      excerpt: sanitizeText(parsed.data.excerpt),
      body:    sanitizeText(parsed.data.body),
    });
    return new Response(JSON.stringify(post), { status: 201, headers });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ message: 'Failed to create post' }), { status: 500, headers });
  }
};
