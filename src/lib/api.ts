/**
 * api.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Typed fetch wrapper that targets your AWS API Gateway REST API.
 *
 * All requests automatically:
 *  • Include credentials (cookies)
 *  • Forward the X-CSRF-Token header on mutating requests
 *  • Throw typed ApiError on non-2xx responses
 *
 * Replace BASE_URL with your actual API Gateway invoke URL or custom domain.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const BASE_URL = import.meta.env.PUBLIC_API_URL ?? 'https://api.solarblessing.com/v1';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Review {
  id:          string;
  product:     'kombucha' | 'sobolo' | 'salve';
  name:        string;
  // email is stored server-side only — never returned to the client
  rating:      1 | 2 | 3 | 4 | 5;
  body:        string;
  status:      'pending' | 'approved' | 'rejected';
  createdAt:   string; // ISO-8601
}

export interface BlogPost {
  id:          string;
  title:       string;
  excerpt:     string;
  body:        string;
  imageUrl?:   string;
  status:      'pending' | 'approved' | 'rejected';
  createdAt:   string;
  publishedAt?: string;
}

export interface Event {
  id:          string;
  title:       string;
  date:        string; // ISO-8601 date
  time:        string; // e.g. "8:00 AM – 2:00 PM"
  location:    string;
  description: string;
  status:      'pending' | 'approved' | 'rejected';
  createdAt:   string;
}

export interface AdminStats {
  pendingReviews:   number;
  pendingPosts:     number;
  pendingEvents:    number;
  approvedReviews:  number;
  approvedPosts:    number;
  approvedEvents:   number;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

// ─── Core fetch helper ────────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options: RequestInit & { csrfToken?: string } = {}
): Promise<T> {
  const { csrfToken, ...init } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> ?? {}),
  };

  if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try { message = (await res.json()).message ?? message; } catch { /* noop */ }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ─── Public API ───────────────────────────────────────────────────────────────

// Reviews
export const reviewsApi = {
  /** Fetch all approved reviews for a product */
  list: (product: Review['product']) =>
    apiFetch<Review[]>(`/reviews?product=${product}&status=approved`),

  /** Submit a new review (pending moderation) */
  create: (data: Omit<Review, 'id' | 'status' | 'createdAt'> & { email: string }, csrfToken: string) =>
    apiFetch<{ id: string }>('/reviews', {
      method: 'POST',
      body: JSON.stringify(data),
      csrfToken,
    }),
};

// Blog posts
export const postsApi = {
  list: () => apiFetch<BlogPost[]>('/posts?status=approved'),
  get:  (id: string) => apiFetch<BlogPost>(`/posts/${id}`),
};

// Events
export const eventsApi = {
  list: () => apiFetch<Event[]>('/events?status=approved'),
};

// ─── Admin API (requires JWT cookie) ─────────────────────────────────────────

export const adminApi = {
  stats: () => apiFetch<AdminStats>('/admin/stats'),

  // Reviews
  listReviews: (status?: string) =>
    apiFetch<Review[]>(`/admin/reviews${status ? `?status=${status}` : ''}`),
  moderateReview: (id: string, action: 'approve' | 'reject', csrfToken: string) =>
    apiFetch<void>(`/admin/reviews/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action }),
      csrfToken,
    }),
  deleteReview: (id: string, csrfToken: string) =>
    apiFetch<void>(`/admin/reviews/${id}`, { method: 'DELETE', csrfToken }),

  // Blog posts
  listPosts: (status?: string) =>
    apiFetch<BlogPost[]>(`/admin/posts${status ? `?status=${status}` : ''}`),
  createPost: (data: Omit<BlogPost, 'id' | 'status' | 'createdAt'>, csrfToken: string) =>
    apiFetch<BlogPost>('/admin/posts', { method: 'POST', body: JSON.stringify(data), csrfToken }),
  moderatePost: (id: string, action: 'approve' | 'reject', csrfToken: string) =>
    apiFetch<void>(`/admin/posts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action }),
      csrfToken,
    }),
  deletePost: (id: string, csrfToken: string) =>
    apiFetch<void>(`/admin/posts/${id}`, { method: 'DELETE', csrfToken }),

  // Events
  listEvents: (status?: string) =>
    apiFetch<Event[]>(`/admin/events${status ? `?status=${status}` : ''}`),
  createEvent: (data: Omit<Event, 'id' | 'status' | 'createdAt'>, csrfToken: string) =>
    apiFetch<Event>('/admin/events', { method: 'POST', body: JSON.stringify(data), csrfToken }),
  moderateEvent: (id: string, action: 'approve' | 'reject', csrfToken: string) =>
    apiFetch<void>(`/admin/events/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action }),
      csrfToken,
    }),
  deleteEvent: (id: string, csrfToken: string) =>
    apiFetch<void>(`/admin/events/${id}`, { method: 'DELETE', csrfToken }),
};
