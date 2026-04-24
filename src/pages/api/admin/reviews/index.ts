import type { APIRoute } from 'astro';
import { requireAdmin, JSON_HEADERS } from '../../../../lib/adminAuth';
import { getReviews } from '../../../../lib/db';

export const GET: APIRoute = async ({ request }) => {
  const headers = JSON_HEADERS();
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.error!;
  const status = new URL(request.url).searchParams.get('status') ?? undefined;
  try {
    return new Response(JSON.stringify(await getReviews(status)), { status: 200, headers });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ message: 'Failed to fetch reviews' }), { status: 500, headers });
  }
};
