# RIPTOP Arena Release Notes

## Build And Preview

- Install dependencies: `npm install`
- Production build: `npm run build`
- Local production preview: `npm run preview -- --host 127.0.0.1 --port 4177`
- Canvas smoke check: `npm run inspect:canvas -- --url http://127.0.0.1:4177/?qa=1`
- Mobile canvas smoke check: `npm run inspect:canvas -- --url http://127.0.0.1:4177/?qa=1 --mobile`

## Deployment

- Deploy the `dist/` folder to any static host.
- `vite.config.ts` uses `base: './'`, so relative asset URLs work for subfolder hosting and static file previews.
- Good targets: Netlify static deploy, Cloudflare Pages static output, GitHub Pages, or any plain CDN/file host.

## Controls

- Desktop:
  - Menu: mouse click
  - Launch: hold mouse or `Space`
  - Aim: `Q` / `E`
  - Battle dash: click arena or use arrow keys / `WASD`
  - Pause: `Esc`
- Touch:
  - Launch: `Aim -`, `Hold Launch`, `Aim +`
  - Battle: `Dash Rival`, `Center`, `Pause`

## Debug Gating

- Camera tuning overlay is hidden unless `?camDebug=1` is present.
- QA helpers and runtime diagnostics are hidden unless `?qa=1`, `?debug=1`, or `?camDebug=1` is present.
- Intended release URL should not include any debug query params.

## Bundle Notes

- `three` is split into its own chunk during build to keep the gameplay bundle smaller and reduce release noise.
- If future content adds heavier assets or systems, revisit chunking and lazy-load noncritical menu/garage modules.

## Residual Risks

- Audio behavior has been validated in browser automation and code paths, but not on a physical mobile device speaker path in this release pass.
- Touch QA was validated in mobile emulation; one real-device pass is still recommended before public release.
