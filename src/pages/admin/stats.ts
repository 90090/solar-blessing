import type { APIRoute } from 'astro';
import { requireAdmin, JSON_HEADERS } from '../../lib/adminAuth';
import { getStats } from '../../lib/db';

export const GET: APIRoute = async ({ request }) => {
  const headers = JSON_HEADERS();
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.error!;
  try {
    return new Response(JSON.stringify(await getStats()), { status: 200, headers });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ message: 'Failed to load stats' }), { status: 500, headers });
  }
};
