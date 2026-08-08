import { defineConfig } from 'vite';

const portalBuild = process.env.VITE_APP_MODE === 'portal';

export default defineConfig({
  base: './',
  publicDir: process.env.NSS_UNIFIED_BUILD === '1' ? false : 'public',
  optimizeDeps: {
    entries: ['index.html'],
  },
  build: {
    chunkSizeWarningLimit: 550,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (portalBuild) return undefined;
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
