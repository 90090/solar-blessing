/**
 * PATCH  /api/admin/reviews/[id]   — approve or reject a review
 * DELETE /api/admin/reviews/[id]   — permanently delete a review
 */
import type { APIRoute } from 'astro';
import { requireAdmin, JSON_HEADERS } from '../../../../lib/adminAuth';
import { sanitizeText } from '../../../../lib/security';

async function patchReview(id: string, action: 'approve' | 'reject') {
  const apiUrl = process.env.API_BASE_URL;
  if (!apiUrl) {
    console.log(`[DEV] ${action} review ${id}`);
    return;
  }
  const res = await fetch(`${apiUrl}/admin/reviews/${encodeURIComponent(id)}`, {
    method:  'PATCH',
    headers: { 'Content-Type':'application/json', 'x-api-key': process.env.API_KEY ?? '' },
    body:    JSON.stringify({ action }),
  });
  if (!res.ok) throw new Error(`Backend ${res.status}`);
}

async function deleteReview(id: string) {
  const apiUrl = process.env.API_BASE_URL;
  if (!apiUrl) { console.log(`[DEV] delete review ${id}`); return; }
  const res = await fetch(`${apiUrl}/admin/reviews/${encodeURIComponent(id)}`, {
    method:  'DELETE',
    headers: { 'x-api-key': process.env.API_KEY ?? '' },
  });
  if (!res.ok) throw new Error(`Backend ${res.status}`);
}

export const PATCH: APIRoute = async ({ request, params }) => {
  const headers = JSON_HEADERS();
  const auth = await requireAdmin(request, true); // CSRF required
  if (!auth.ok) return auth.error!;

  const id = sanitizeText(params.id ?? '').slice(0, 100);
  if (!id) return new Response(JSON.stringify({ message: 'Missing id' }), { status: 400, headers });

  let action: string;
  try {
    const body = await request.json();
    action = body.action;
  } catch {
    return new Response(JSON.stringify({ message: 'Invalid JSON' }), { status: 400, headers });
  }

  if (action !== 'approve' && action !== 'reject') {
    return new Response(JSON.stringify({ message: 'action must be approve or reject' }), { status: 422, headers });
  }

  try {
    await patchReview(id, action);
    return new Response(null, { status: 204, headers });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ message: 'Update failed' }), { status: 500, headers });
  }
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const headers = JSON_HEADERS();
  const auth = await requireAdmin(request, true);
  if (!auth.ok) return auth.error!;

  const id = sanitizeText(params.id ?? '').slice(0, 100);
  if (!id) return new Response(JSON.stringify({ message: 'Missing id' }), { status: 400, headers });

  try {
    await deleteReview(id);
    return new Response(null, { status: 204, headers });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ message: 'Delete failed' }), { status: 500, headers });
  }
};
