import { copyFile, mkdir, readFile, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const customizerRoot = join(projectRoot, 'battle-top-designer', 'web-customizer');
const sourceModels = join(projectRoot, 'battle-top-designer', 'public', 'models', 'parts');
const siteRoot = join(projectRoot, 'dist', 'site');
const sharedModels = join(siteRoot, 'assets', 'nss', 'parts');
const node = process.execPath;

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function run(cwd, args, extraEnv = {}) {
  const result = spawnSync(node, args, {
    cwd,
    env: { ...process.env, ...extraEnv },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Command failed with exit ${result.status}: ${args.join(' ')}`);
}

if (await pathExists(siteRoot)) {
  throw new Error(`Unified site output already exists and was not modified: ${siteRoot}`);
}

await mkdir(sharedModels, { recursive: true });

run(projectRoot, [join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc')]);
run(customizerRoot, [join(customizerRoot, 'scripts', 'build-product-catalog.mjs'), '--check']);
run(customizerRoot, [join(customizerRoot, 'node_modules', 'typescript', 'bin', 'tsc'), '--noEmit']);

const sharedBuildEnv = {
  NSS_UNIFIED_BUILD: '1',
  VITE_NSS_MODEL_ROOT: '../assets/nss/parts/',
};
run(projectRoot, [
  join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js'),
  'build', '--outDir', join(siteRoot, 'arena'),
], { ...sharedBuildEnv, VITE_CUSTOMIZER_URL: '../customizer/' });
run(customizerRoot, [
  join(customizerRoot, 'node_modules', 'vite', 'bin', 'vite.js'),
  'build', '--outDir', join(siteRoot, 'customizer'),
], { ...sharedBuildEnv, VITE_ARENA_URL: '../arena/' });

await copyFile(join(projectRoot, 'site', 'index.html'), join(siteRoot, 'index.html'));
const catalog = JSON.parse(await readFile(
  join(projectRoot, 'battle-top-designer', 'shared', 'nss', 'parts.catalog.json'),
  'utf8',
));
for (const part of catalog.parts) {
  await copyFile(join(sourceModels, `${part.id}.glb`), join(sharedModels, `${part.id}.glb`));
}

run(projectRoot, [join(projectRoot, 'scripts', 'verify-unified-site.mjs')]);
console.log(`Unified NSS site built: ${siteRoot}`);
