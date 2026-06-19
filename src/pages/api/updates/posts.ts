export const prerender = false;

import type { APIRoute } from 'astro';
import { getPosts } from '../../../lib/db';
import { securityHeaders, corsHeaders } from '../../../lib/security';

export const GET: APIRoute = async () => {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
    ...securityHeaders(),
    ...corsHeaders(),
  });
  try {
    const posts = await getPosts('approved');
    return new Response(JSON.stringify(posts), { status: 200, headers });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify([]), { status: 200, headers });
  }
};

// CORS preflight — the browser sends this before the real GET when the
// request is cross-origin, which it now is (DreamHost calling this Lambda).
export const OPTIONS: APIRoute = async () => {
  return new Response(null, { status: 204, headers: corsHeaders() });
};
