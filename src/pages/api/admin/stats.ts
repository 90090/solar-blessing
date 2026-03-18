/**
 * GET /api/admin/stats
 * Returns pending/approved counts. JWT + CSRF protected.
 */
import type { APIRoute } from 'astro';
import { verifyAdminToken, getTokenFromCookies, verifyCsrfToken, securityHeaders } from '../../../lib/security';

// Replace this stub with real DynamoDB/API Gateway calls in production
async function fetchStatsFromBackend() {
  const apiUrl = process.env.API_BASE_URL;
  if (!apiUrl) {
    // Dev stub
    return { pendingReviews:3, pendingPosts:1, pendingEvents:0, approvedReviews:12, approvedPosts:4, approvedEvents:2 };
  }
  const res = await fetch(`${apiUrl}/admin/stats`, {
    headers: { 'x-api-key': process.env.API_KEY ?? '' },
  });
  return res.json();
}

export const GET: APIRoute = async ({ request }) => {
  const headers = new Headers({ 'Content-Type': 'application/json', ...securityHeaders() });
  try {
    const token = getTokenFromCookies(request.headers.get('cookie'));
    if (!token) return new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401, headers });
    await verifyAdminToken(token);
    const stats = await fetchStatsFromBackend();
    return new Response(JSON.stringify(stats), { status: 200, headers });
  } catch {
    return new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401, headers });
  }
};
