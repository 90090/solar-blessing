// ── Client-safe validation/sanitization ──────────────────────────────────────
//
// Deliberately has ZERO imports. This file is safe to import from React
// components that get bundled for the browser (e.g. ReviewForm.tsx).
//
// security.ts (the server-only sibling of this file) pulls in `jose` for JWT
// signing and the AWS SDK for the DynamoDB-backed rate limiter — neither of
// those belong in client JS. Importing from security.ts in a browser
// component would drag all of that into the bundle. Import from here instead
// for anything that needs to run client-side.
//
// IMPORTANT: client-side sanitization is a UX nicety (catches obvious
// mistakes before a round trip), not a security boundary. The server-side
// copies of these same functions in security.ts are what actually protects
// the API — never trust the client-run versions for anything security
// sensitive, since a user can always bypass the browser and call the API
// directly with unsanitized input.

export function sanitizeText(raw: string): string {
  return String(raw)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#x27;')
    .replace(/\//g, '&#x2F;')
    .trim()
    .slice(0, 4096);
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(email);
}

export function sanitizeRating(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 5) throw new Error('Invalid rating');
  return n;
}