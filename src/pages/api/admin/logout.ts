import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ redirect }) => {
  const headers = new Headers();
  headers.append('Set-Cookie', 'admin_token=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
  headers.append('Set-Cookie', 'csrf_token=; Path=/; Secure; SameSite=Strict; Max-Age=0');
  headers.set('Location', '/admin');
  return new Response(null, { status: 303, headers });
};
