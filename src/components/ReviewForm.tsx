'use client';
import { useState, useRef } from 'react';
import StarRating from './StarRating';
import { sanitizeText, isValidEmail, sanitizeRating } from '../lib/security';
import type { Review } from '../lib/api';

interface ReviewFormProps {
  product: Review['product'];
  csrfToken: string;
}

interface FormState {
  name:   string;
  email:  string;
  body:   string;
  rating: number;
}

type Status = 'idle' | 'submitting' | 'success' | 'error';

const MAX_BODY = 1000;

export default function ReviewForm({ product, csrfToken }: ReviewFormProps) {
  const [form, setForm] = useState<FormState>({ name: '', email: '', body: '', rating: 0 });
  const [errors, setErrors] = useState<Partial<FormState & { rating: string }>>({});
  const [status, setStatus] = useState<Status>('idle');
  const formRef = useRef<HTMLFormElement>(null);

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
      // Client-side sanitization (server must also sanitize)
      const payload = {
        product,
        name:   sanitizeText(form.name),
        email:  form.email.toLowerCase().trim(),
        body:   sanitizeText(form.body),
        rating: sanitizeRating(form.rating) as 1|2|3|4|5,
      };

      const res = await fetch('/api/reviews', {
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
        disabled={status === 'submitting'}
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
        ) : 'Submit Review'}
      </button>
    </form>
  );
}
