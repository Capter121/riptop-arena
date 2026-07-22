import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  publicDir: process.env.NSS_UNIFIED_BUILD === '1' ? false : 'public',
  build: {
    chunkSizeWarningLimit: 550,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) {
            return 'three';
          }

          if (id.includes('node_modules')) {
            return 'vendor';
          }
        },
      },
    },
  },
});
