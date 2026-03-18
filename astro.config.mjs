import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  integrations: [react(), tailwind()],
  output: 'server', // SSR required for protected admin routes + API endpoints
  server: {
    port: 4321,
  },
});
