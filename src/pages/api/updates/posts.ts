import type { APIRoute } from 'astro';
import { getPosts } from '../../../lib/db';
import { securityHeaders } from '../../../lib/security';

export const GET: APIRoute = async () => {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
    ...securityHeaders(),
  });
  try {
    const posts = await getPosts('approved');
    return new Response(JSON.stringify(posts), { status: 200, headers });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify([]), { status: 200, headers });
  }
};
