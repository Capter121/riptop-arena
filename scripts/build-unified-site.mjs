import { copyFile, mkdir, readdir, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const customizerRoot = join(projectRoot, 'battle-top-designer', 'web-customizer');
const arenaPublicRoot = join(projectRoot, 'public');
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

async function copyTree(source, target) {
  await mkdir(target, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const sourcePath = join(source, entry.name);
    const targetPath = join(target, entry.name);
    if (entry.isDirectory()) await copyTree(sourcePath, targetPath);
    else await copyFile(sourcePath, targetPath);
  }
}

if (await pathExists(siteRoot)) {
  throw new Error(`Unified site output already exists and was not modified: ${siteRoot}`);
}

run(projectRoot, [join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc')]);
run(customizerRoot, [join(customizerRoot, 'scripts', 'build-product-catalog.mjs'), '--check']);
run(customizerRoot, [join(customizerRoot, 'node_modules', 'typescript', 'bin', 'tsc'), '--noEmit']);

const sharedBuildEnv = {
  NSS_UNIFIED_BUILD: '1',
  VITE_NSS_MODEL_ROOT: '../assets/nss/parts/',
};
run(projectRoot, [
  join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js'),
  'build', '--outDir', siteRoot,
], { ...sharedBuildEnv, VITE_APP_MODE: 'portal' });
run(projectRoot, [
  join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js'),
  'build', '--outDir', join(siteRoot, 'arena'),
], { ...sharedBuildEnv, VITE_APP_MODE: 'arena', VITE_CUSTOMIZER_URL: '../customizer/' });
run(customizerRoot, [
  join(customizerRoot, 'node_modules', 'vite', 'bin', 'vite.js'),
  'build', '--outDir', join(siteRoot, 'customizer'),
], { ...sharedBuildEnv, VITE_ARENA_URL: '../arena/' });

await copyTree(arenaPublicRoot, siteRoot);
await mkdir(sharedModels, { recursive: true });
run(projectRoot, [join(projectRoot, 'scripts', 'copy-nss-models.mjs'), sharedModels]);

run(projectRoot, [join(projectRoot, 'scripts', 'verify-unified-site.mjs')]);
console.log(`Unified NSS site built: ${siteRoot}`);
