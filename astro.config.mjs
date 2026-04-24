import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import node from '@astrojs/node';

export default defineConfig({
  integrations: [react(), tailwind()],
  output: 'server',
  adapter: node({
    mode: 'standalone',
  }),
  server: {
    host: true, // This tells Astro to listen on all addresses (0.0.0.0)
    port: 4321
  }
});