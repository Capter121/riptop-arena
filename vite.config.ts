import { defineConfig } from 'vite';

const portalBuild = process.env.VITE_APP_MODE === 'portal';
const unifiedPortalBuild = portalBuild && process.env.NSS_UNIFIED_BUILD === '1';

export default defineConfig({
  base: unifiedPortalBuild ? '/' : './',
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
