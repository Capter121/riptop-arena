import { defineConfig } from 'vite';

// Relative base so the production build works when served from any sub-path
// (e.g. GitHub Pages project pages, itch.io, a static folder).
export default defineConfig({
  base: './',
  // Dedicated port so it doesn't collide with a sibling dev server on 5173.
  server: { port: 5188, host: true },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
  },
});
