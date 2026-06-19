// The static pages (kombucha/sobolo/salve, home, about) are served from
// DreamHost. The API (reviews, posts, events, csrf, admin/*) runs on a
// separate Lambda behind CloudFront. Relative fetch paths like '/api/reviews'
// would resolve against the PAGE's own origin (DreamHost) and 404 — every
// client-side fetch to the API needs the full cross-origin URL instead.
//
// Set at build time via an environment variable so this isn't hardcoded —
// see package.json's "build" script and .env.production.
export const API_BASE_URL: string =
  import.meta.env.PUBLIC_API_BASE_URL ?? 'https://api.solarblessings.com';
