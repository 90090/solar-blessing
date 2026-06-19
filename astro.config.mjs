import { defineConfig } from 'astro/config';
import react    from '@astrojs/react';
import tailwind from '@tailwindcss/vite';
import node     from '@astrojs/node';

// ── Why two build modes ───────────────────────────────────────────────────────
//
// This project deploys to two places (DreamHost static + AWS Lambda API), and
// it turned out they need two DIFFERENT Astro output modes because of an Astro
// 4.16 routing bug:
//
//   In 'hybrid' mode, prerendered routes and on-demand API routes coexist in
//   one route manifest. Astro 4.16's runtime router can mis-match a request
//   for an on-demand endpoint (e.g. /api/updates/posts) against a prerendered
//   route first, and serve the 404 page instead of running the endpoint. The
//   route is correctly registered as prerender:false — the bug is in runtime
//   route *matching*, not the build. (Fixed in later Astro; see
//   withastro/astro PR #16562.)
//
// The fix: the Lambda only ever serves on-demand routes (/admin, /api/*) —
// the static pages live on DreamHost and are served there, never by the
// Lambda. So the Lambda build uses output:'server' (everything on-demand,
// ZERO prerendered routes) which removes the precondition for the collision
// entirely. The DreamHost build still uses 'hybrid' to prerender the static
// pages.
//
// ── How to build each ─────────────────────────────────────────────────────────
//
//   BUILD_TARGET=lambda npm run build   → output:'server', for the Lambda
//                                         (dist/server/ = all routes on-demand)
//   npm run build                        → output:'hybrid', for DreamHost
//                                         (dist/client/ = prerendered static)
//
// See package.json scripts "build" and "build:lambda".

const isLambda = process.env.BUILD_TARGET === 'lambda';

export default defineConfig({
  output:  isLambda ? 'server' : 'hybrid',
  adapter: node({ mode: 'standalone' }),
  integrations: [react()],
  vite: {
    plugins: [tailwind()],
  },
});
