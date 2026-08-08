import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const siteRoot = join(projectRoot, 'dist', 'site');
const arenaPublicRoot = join(projectRoot, 'public');
const baseline = JSON.parse(await readFile(
  join(projectRoot, 'battle-top-designer', 'reports', 'validation', 'nss-arena-integration-stage0-baseline.json'),
  'utf8',
));

async function filesBelow(root) {
  const result = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) result.push(...await filesBelow(path));
    else result.push(path);
  }
  return result;
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

for (const required of ['index.html', 'customizer/index.html', 'arena/index.html']) {
  assert.equal((await stat(join(siteRoot, required))).isFile(), true, `Missing ${required}`);
}

const portalHtml = await readFile(join(siteRoot, 'index.html'), 'utf8');
assert.match(portalHtml, /<script\s+type="module"[^>]+src="\.\/assets\/[^"']+\.js"/i, 'Portal is not a Vite module entry');
assert.equal(portalHtml.includes('href="./customizer/"'), false, 'Legacy static portal was copied into the build');

const files = await filesBelow(siteRoot);
const rootScripts = files.filter(path => /^assets\/[^/]+\.js$/.test(relative(siteRoot, path).replaceAll('\\', '/')));
assert.equal(rootScripts.some(path => /^three-/.test(path.split(/[\\/]/).at(-1))), false, 'Portal emitted a Three.js chunk');
for (const path of rootScripts) {
  assert.equal((await stat(path)).size > 1, true, `Portal emitted an empty script chunk: ${path}`);
}
const glbs = files.filter(path => path.toLowerCase().endsWith('.glb'));
assert.equal(glbs.length, 16, `Expected one set of 16 GLBs, received ${glbs.length}`);
assert.equal(glbs.every(path => relative(siteRoot, path).replaceAll('\\', '/').startsWith('assets/nss/parts/')), true);

const expectedHashes = new Map(baseline.formalPartGlbs.entries.map(entry => {
  const [name, , hash] = entry.split('|');
  return [name, hash];
}));
for (const path of glbs) {
  const name = path.split(/[\\/]/).at(-1);
  assert.equal(sha256(await readFile(path)), expectedHashes.get(name), `GLB hash mismatch: ${name}`);
}

const arenaPublicFiles = await filesBelow(arenaPublicRoot);
for (const source of arenaPublicFiles) {
  const relativePath = relative(arenaPublicRoot, source);
  const target = join(siteRoot, relativePath);
  assert.equal((await stat(target)).isFile(), true, `Missing Arena public asset: ${relativePath}`);
  assert.equal(sha256(await readFile(target)), sha256(await readFile(source)), `Arena public asset hash mismatch: ${relativePath}`);
}

const textFiles = files.filter(path => /\.(?:html|js|css)$/.test(path));
const text = (await Promise.all(textFiles.map(path => readFile(path, 'utf8')))).join('\n');
assert.equal(text.includes('../assets/nss/parts/'), true, 'Shared NSS model root is absent from bundles');
assert.equal(text.includes('../arena/'), true, 'Customizer-to-Arena route is absent from bundles');
assert.equal(text.includes('../customizer/'), true, 'Arena-to-Customizer route is absent from bundles');
assert.equal(/(?:localhost|127\.0\.0\.1):417[456]/.test(text), false, 'Development port leaked into production output');
assert.equal(/[A-Za-z]:\\(?!['"])/.test(text), false, 'Windows absolute path leaked into production output');

console.log(JSON.stringify({
  status: 'PASS',
  routes: ['/', '/customizer/', '/arena/'],
  formalGlbCount: glbs.length,
  formalGlbHashMismatchCount: 0,
  duplicateGlbCount: 0,
  arenaPublicAssetCount: arenaPublicFiles.length,
  developmentEndpointLeakCount: 0,
}, null, 2));
