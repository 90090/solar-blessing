import type { APIRoute } from 'astro';
import { getEvents } from '../../../lib/db';
import { securityHeaders } from '../../../lib/security';

export const GET: APIRoute = async () => {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
    ...securityHeaders(),
  });
  try {
    const events = await getEvents('approved');
    return new Response(JSON.stringify(events), { status: 200, headers });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify([]), { status: 200, headers });
  }
};
