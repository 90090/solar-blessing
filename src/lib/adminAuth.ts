import {
  verifyAdminToken,
  getTokenFromCookies,
  verifyCsrfToken,
  securityHeaders,
} from './security';

export interface AuthResult {
  ok:      boolean;
  adminId: string;
  error?:  Response;
}

export function JSON_HEADERS(): Headers {
  return new Headers({
    'Content-Type': 'application/json',
    ...securityHeaders(),
  });
}

export async function requireAdmin(
  request: Request,
  requireCsrf = false
): Promise<AuthResult> {
  const headers = JSON_HEADERS();

  // 1. Verify JWT
  let adminId = '';
  try {
    const token = getTokenFromCookies(request.headers.get('cookie'));
    if (!token) throw new Error('No token');
    const payload = await verifyAdminToken(token);
    adminId = payload.sub ?? 'admin';
  } catch {
    return {
      ok:     false,
      adminId: '',
      error:  new Response(
        JSON.stringify({ message: 'Unauthorized' }),
        { status: 401, headers }
      ),
    };
  }

  // 2. Verify CSRF on mutating requests (POST, PATCH, DELETE)
  if (requireCsrf) {
    const cookieCsrf = request.headers.get('cookie')
      ?.match(/csrf_token=([^;]+)/)?.[1] ?? null;
    const headerCsrf = request.headers.get('x-csrf-token');

    if (!verifyCsrfToken(cookieCsrf, headerCsrf)) {
      return {
        ok:     false,
        adminId: '',
        error:  new Response(
          JSON.stringify({ message: 'Invalid CSRF token' }),
          { status: 403, headers }
        ),
      };
    }
  }

  return { ok: true, adminId };
}
