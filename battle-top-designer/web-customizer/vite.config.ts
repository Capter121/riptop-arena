import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [react()],
  publicDir: process.env.NSS_UNIFIED_BUILD === '1'
    ? false
    : resolve(__dirname, '../public/models/parts'),
  server: { host: '127.0.0.1', port: 4174 },
  preview: { host: '127.0.0.1', port: 4174 },
});
