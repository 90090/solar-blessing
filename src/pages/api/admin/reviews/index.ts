/**
 * GET  /api/admin/reviews        — list reviews (filterable by status)
 * POST /api/admin/reviews        — (not used; public route handles creation)
 */
import type { APIRoute } from 'astro';
import { requireAdmin, JSON_HEADERS } from '../../../../lib/adminAuth';

async function fetchReviews(status?: string) {
  const apiUrl = process.env.API_BASE_URL;
  if (!apiUrl) {
    // Dev stubs
    return [
      { id:'r1', product:'kombucha', name:'Sarah M.', rating:5, body:'Absolutely love it! Tastes great and my digestion has improved so much.', status:'pending',  createdAt: new Date().toISOString() },
      { id:'r2', product:'salve',    name:'Mike R.',  rating:5, body:'Healed my cracked winter hands in less than a week. Will never go back.', status:'approved', createdAt: new Date(Date.now()-86400000).toISOString() },
      { id:'r3', product:'sobolo',   name:'Ama K.',   rating:4, body:'Refreshing and not too sweet. Exactly what I was looking for.',           status:'pending',  createdAt: new Date(Date.now()-3600000).toISOString() },
    ].filter(r => !status || r.status === status);
  }
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  const res = await fetch(`${apiUrl}/admin/reviews${qs}`, {
    headers: { 'x-api-key': process.env.API_KEY ?? '' },
  });
  return res.json();
}

export const GET: APIRoute = async ({ request }) => {
  const headers = JSON_HEADERS();
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.error!;

  const url    = new URL(request.url);
  const status = url.searchParams.get('status') ?? undefined;

  try {
    const reviews = await fetchReviews(status);
    return new Response(JSON.stringify(reviews), { status: 200, headers });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ message: 'Failed to fetch reviews' }), { status: 500, headers });
  }
};
