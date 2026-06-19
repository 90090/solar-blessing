import { useState, useRef, useEffect } from 'react';
import StarRating from './StarRating';
// Pulled from the client-safe sanitize.ts, NOT security.ts — security.ts now
// imports the AWS SDK (DynamoDB) and `jose` (JWT) for server-only logic, and
// none of that should ever end up in a browser bundle.
import { sanitizeText, isValidEmail, sanitizeRating } from '../lib/sanitize';
import { API_BASE_URL } from '../lib/apiConfig';

// Note: '../lib/api' (the original import source for this type) doesn't
// exist anywhere in the project as uploaded — defined locally instead.
// db.ts has the authoritative Product type, but db.ts is server-only (pulls
// in the AWS SDK), so importing from it here would have the same
// client-bundle problem already fixed for security.ts/sanitize.ts.
type Product = 'kombucha' | 'sobolo' | 'salve';

interface ReviewFormProps {
  product: Product;
}

interface FormState {
  name:   string;
  email:  string;
  body:   string;
  rating: number;
}

type Status = 'idle' | 'submitting' | 'success' | 'error';

const MAX_BODY = 1000;

export default function ReviewForm({ product }: ReviewFormProps) {
  const [form, setForm] = useState<FormState>({ name: '', email: '', body: '', rating: 0 });
  const [errors, setErrors] = useState<Partial<FormState & { rating: string }>>({});
  const [status, setStatus] = useState<Status>('idle');
  const [csrfToken, setCsrfToken] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  // ── Fetch CSRF token on mount ──────────────────────────────────────────────
  // This page is now static HTML served from DreamHost — there's no Astro
  // middleware running at request time to set this cookie server-side
  // anymore (that only happens for pages rendered by the Lambda, like
  // /admin). Instead we hit a dedicated endpoint that issues the token and
  // sets it via Set-Cookie cross-origin (SameSite=None; Secure — see
  // src/pages/api/csrf.ts for why). credentials:'include' is required on
  // every fetch here for the cookie to actually be stored/sent.
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/csrf`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => setCsrfToken(data.csrfToken ?? ''))
      .catch(err => console.error('Could not fetch CSRF token:', err));
  }, []);

  // ── Validation ──────────────────────────────────────────────────────────────
  function validate(): boolean {
    const e: typeof errors = {};
    if (!form.name.trim())              e.name   = 'Name is required';
    if (!isValidEmail(form.email))      e.email  = 'Valid email required (kept private)';
    if (form.body.trim().length < 10)   e.body   = 'Please write at least 10 characters';
    if (form.body.length > MAX_BODY)    e.body   = `Max ${MAX_BODY} characters`;
    if (!form.rating)                   e.rating = 'Please select a star rating';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setStatus('submitting');

    try {
      // Client-side sanitization is a UX nicety only — the server runs the
      // same checks again (and is the only copy that actually matters for
      // security) in src/pages/api/reviews/index.ts.
      const payload = {
        product,
        name:   sanitizeText(form.name),
        email:  form.email.toLowerCase().trim(),
        body:   sanitizeText(form.body),
        rating: sanitizeRating(form.rating) as 1|2|3|4|5,
      };

      const res = await fetch(`${API_BASE_URL}/api/reviews`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'X-CSRF-Token':  csrfToken,
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? 'Submission failed');
      }

      setStatus('success');
      setForm({ name: '', email: '', body: '', rating: 0 });
      formRef.current?.reset();
    } catch (err) {
      console.error(err);
      setStatus('error');
    }
  }

  if (status === 'success') {
    return (
      <div className="rounded-2xl bg-forest/10 border border-forest/20 p-8 text-center space-y-3 animate-fade-in">
        <span className="text-4xl">🎉</span>
        <h3 className="font-display text-2xl text-forest">Thank you!</h3>
        <p className="font-body text-bark/70">
          Your review has been submitted and will appear after approval.
        </p>
        <button
          className="btn-ghost text-sm"
          onClick={() => setStatus('idle')}
        >
          Leave another review
        </button>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-5">
      {status === 'error' && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 animate-fade-in">
          Something went wrong. Please try again.
        </div>
      )}

      {/* Star rating */}
      <div>
        <label className="label">Your rating</label>
        <StarRating
          value={form.rating}
          onChange={r => setForm(prev => ({ ...prev, rating: r }))}
          size="lg"
        />
        {errors.rating && <p className="text-red-500 text-xs mt-1">{errors.rating}</p>}
      </div>

      {/* Name */}
      <div>
        <label className="label" htmlFor="review-name">Display name</label>
        <input
          id="review-name"
          type="text"
          maxLength={80}
          placeholder="Jane D."
          className={`input ${errors.name ? 'ring-2 ring-red-400' : ''}`}
          value={form.name}
          onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
        />
        {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
      </div>

      {/* Email */}
      <div>
        <label className="label" htmlFor="review-email">
          Email <span className="font-normal text-bark/40">(kept private, never displayed)</span>
        </label>
        <input
          id="review-email"
          type="email"
          maxLength={254}
          placeholder="you@example.com"
          className={`input ${errors.email ? 'ring-2 ring-red-400' : ''}`}
          value={form.email}
          onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
        />
        {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
      </div>

      {/* Body */}
      <div>
        <label className="label" htmlFor="review-body">Your review</label>
        <textarea
          id="review-body"
          maxLength={MAX_BODY}
          rows={4}
          placeholder="Tell us about your experience…"
          className={`textarea ${errors.body ? 'ring-2 ring-red-400' : ''}`}
          value={form.body}
          onChange={e => setForm(prev => ({ ...prev, body: e.target.value }))}
        />
        <div className="flex justify-between mt-1">
          {errors.body
            ? <p className="text-red-500 text-xs">{errors.body}</p>
            : <span />}
          <span className="text-xs text-bark/40">{form.body.length}/{MAX_BODY}</span>
        </div>
      </div>

      <button
        type="submit"
        disabled={status === 'submitting' || !csrfToken}
        className="btn-primary w-full justify-center disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {status === 'submitting' ? (
          <>
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            Submitting…
          </>
        ) : !csrfToken ? 'Loading…' : 'Submit Review'}
      </button>
    </form>
  );
}
