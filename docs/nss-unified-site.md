# NSS unified static site

Run `npm run build:site` from the repository root in a clean output workspace. The command creates:

- `dist/site/customizer/`
- `dist/site/arena/`
- `dist/site/assets/nss/parts/` with exactly the 16 formal GLBs

The build intentionally stops when `dist/site` already exists so it cannot delete or mix an earlier release output. Serve `dist/site` as the static root. Both applications use relative sibling routes, so the directory may also be deployed below a URL prefix.

Arena's existing images and videos are copied from the root `public/` directory. The formal NSS model copier is separate so the unified package can place those 16 GLBs only in the shared model directory.

Run `npm run verify:site` to recheck routes, model count, protected GLB hashes, and development endpoint leakage without rebuilding.
