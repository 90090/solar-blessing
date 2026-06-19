export const prerender = false;

import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ redirect }) => {
  const headers = new Headers();
  // Flags must exactly match how cookies were originally set in login.ts
  // (now: Secure + SameSite=Lax, since Lambda Function URL + CloudFront is
  // always HTTPS) — mismatched flags = browser won't clear them.
  headers.append('Set-Cookie', 'admin_token=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0');
  headers.append('Set-Cookie', 'admin_csrf_token=; Path=/; SameSite=Lax; Secure; Max-Age=0');
  headers.set('Location', '/admin');
  return new Response(null, { status: 303, headers });
};
