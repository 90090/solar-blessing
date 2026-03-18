/**
 * PATCH  /api/admin/events/[id]
 * DELETE /api/admin/events/[id]
 */
import type { APIRoute } from 'astro';
import { requireAdmin, JSON_HEADERS } from '../../../../lib/adminAuth';
import { sanitizeText } from '../../../../lib/security';

const apiCall = async (method: string, id: string, body?: object) => {
  const apiUrl = process.env.API_BASE_URL;
  if (!apiUrl) { console.log(`[DEV] ${method} event ${id}`, body); return; }
  const res = await fetch(`${apiUrl}/admin/events/${encodeURIComponent(id)}`, {
    method,
    headers: { 'Content-Type':'application/json', 'x-api-key': process.env.API_KEY ?? '' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Backend ${res.status}`);
};

export const PATCH: APIRoute = async ({ request, params }) => {
  const headers = JSON_HEADERS();
  const auth = await requireAdmin(request, true);
  if (!auth.ok) return auth.error!;
  const id = sanitizeText(params.id ?? '').slice(0, 100);
  let action: string;
  try { action = (await request.json()).action; }
  catch { return new Response(JSON.stringify({ message: 'Invalid JSON' }), { status: 400, headers }); }
  if (action !== 'approve' && action !== 'reject')
    return new Response(JSON.stringify({ message: 'Invalid action' }), { status: 422, headers });
  try { await apiCall('PATCH', id, { action }); return new Response(null, { status: 204, headers }); }
  catch { return new Response(JSON.stringify({ message: 'Update failed' }), { status: 500, headers }); }
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const headers = JSON_HEADERS();
  const auth = await requireAdmin(request, true);
  if (!auth.ok) return auth.error!;
  const id = sanitizeText(params.id ?? '').slice(0, 100);
  try { await apiCall('DELETE', id); return new Response(null, { status: 204, headers }); }
  catch { return new Response(JSON.stringify({ message: 'Delete failed' }), { status: 500, headers }); }
};
