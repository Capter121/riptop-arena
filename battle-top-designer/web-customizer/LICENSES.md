# Offline dependency licenses

The prototype bundles only local npm dependencies. Exact versions are locked in `package-lock.json`.

- React and React DOM — MIT
- Three.js — MIT
- React Three Fiber and Drei — MIT
- Zustand — MIT
- node-qrcode 1.5.4 — MIT
- jsQR 1.4.0 (test-only decoder) — Apache-2.0
- pngjs 7.0.0 (test-only PNG verifier) — MIT
- Vite and plugin-react — MIT
- TypeScript — Apache-2.0
- Vitest — MIT
- Playwright — Apache-2.0

No CDN, remote font, analytics, Draco decoder, or runtime network dependency is used.
PNG cards use the host operating system's `system-ui` font fallback; no font file is bundled.
