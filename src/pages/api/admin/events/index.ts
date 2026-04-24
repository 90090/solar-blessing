import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireAdmin, JSON_HEADERS } from '../../../../lib/adminAuth';
import { getEvents, createEvent } from '../../../../lib/db';
import { sanitizeText } from '../../../../lib/security';

const EventSchema = z.object({
  title:       z.string().min(1).max(200),
  date:        z.string().min(1).max(80),
  time:        z.string().max(80).default(''),
  location:    z.string().min(1).max(200),
  description: z.string().max(600).default(''),
});

export const GET: APIRoute = async ({ request }) => {
  const headers = JSON_HEADERS();
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.error!;
  const status = new URL(request.url).searchParams.get('status') ?? undefined;
  try {
    return new Response(JSON.stringify(await getEvents(status)), { status: 200, headers });
  } catch (err) {
    console.error(err);
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
    return new Response(JSON.stringify({ message: parsed.error.errors.map(e => e.message).join(', ') }), { status: 422, headers });
  try {
    const ev = await createEvent({
      title:       sanitizeText(parsed.data.title),
      date:        sanitizeText(parsed.data.date),
      time:        sanitizeText(parsed.data.time),
      location:    sanitizeText(parsed.data.location),
      description: sanitizeText(parsed.data.description),
    });
    return new Response(JSON.stringify(ev), { status: 201, headers });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ message: 'Failed to create event' }), { status: 500, headers });
  }
};
