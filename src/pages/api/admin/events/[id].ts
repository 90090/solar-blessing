export const prerender = false;

import type { APIRoute } from 'astro';
import { requireAdmin, JSON_HEADERS } from '../../../../lib/adminAuth';
import { moderateEvent, deleteEvent } from '../../../../lib/db';
import { sanitizeText } from '../../../../lib/security';

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
  try {
    await moderateEvent(id, action);
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
  try {
    await deleteEvent(id);
    return new Response(null, { status: 204, headers });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ message: 'Delete failed' }), { status: 500, headers });
  }
};
