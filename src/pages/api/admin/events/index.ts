/**
 * GET  /api/admin/events   — list events
 * POST /api/admin/events   — create a new event (auto-approved)
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireAdmin, JSON_HEADERS } from '../../../../lib/adminAuth';
import { sanitizeText } from '../../../../lib/security';

const EventSchema = z.object({
  title:       z.string().min(1).max(200),
  date:        z.string().min(1).max(80),
  time:        z.string().max(80).optional().default(''),
  location:    z.string().min(1).max(200),
  description: z.string().max(600).optional().default(''),
});

async function fetchEvents(status?: string) {
  const apiUrl = process.env.API_BASE_URL;
  if (!apiUrl) {
    return [
      { id:'e1', title:'Downtown Farmers Market', date:'Saturday, March 15', time:'8:00 AM – 2:00 PM', location:'City Center Plaza', description:'Come find us at booth #12!', status:'approved', createdAt: new Date().toISOString() },
      { id:'e2', title:'Wellness Fair',            date:'Sunday, March 23',  time:'10:00 AM – 4:00 PM', location:'Community Center',  description:'Sample all three products!', status:'approved', createdAt: new Date().toISOString() },
    ].filter(e => !status || e.status === status);
  }
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  const res = await fetch(`${process.env.API_BASE_URL}/admin/events${qs}`, {
    headers: { 'x-api-key': process.env.API_KEY ?? '' },
  });
  return res.json();
}

async function createEvent(data: z.infer<typeof EventSchema>) {
  const apiUrl = process.env.API_BASE_URL;
  if (!apiUrl) {
    const ev = { id:`e${Date.now()}`, ...data, status:'approved', createdAt: new Date().toISOString() };
    console.log('[DEV] Created event:', ev);
    return ev;
  }
  const res = await fetch(`${apiUrl}/admin/events`, {
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
    return new Response(JSON.stringify(await fetchEvents(status)), { status: 200, headers });
  } catch {
    return new Response(JSON.stringify({ message: 'Failed to fetch events' }), { status: 500, headers });
  }
};

export const POST: APIRoute = async ({ request }) => {
  const headers = JSON_HEADERS();
  const auth = await requireAdmin(request, true);
  if (!auth.ok) return auth.error!;

  let body: unknown;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ message: 'Invalid JSON' }), { status: 400, headers }); }

  const parsed = EventSchema.safeParse(body);
  if (!parsed.success)
    return new Response(JSON.stringify({ message: parsed.error.errors.map(e=>e.message).join(', ') }), { status: 422, headers });

  const safe = {
    title:       sanitizeText(parsed.data.title),
    date:        sanitizeText(parsed.data.date),
    time:        sanitizeText(parsed.data.time ?? ''),
    location:    sanitizeText(parsed.data.location),
    description: sanitizeText(parsed.data.description ?? ''),
  };

  try {
    const ev = await createEvent(safe);
    return new Response(JSON.stringify(ev), { status: 201, headers });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ message: 'Failed to create event' }), { status: 500, headers });
  }
};
