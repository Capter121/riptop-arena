import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute, join, resolve } from 'node:path';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const targetArgument = process.argv[2];
if (!targetArgument) throw new Error('Usage: node scripts/copy-nss-models.mjs <target-directory>');

const target = isAbsolute(targetArgument) ? targetArgument : resolve(projectRoot, targetArgument);
const source = join(projectRoot, 'battle-top-designer', 'public', 'models', 'parts');
const catalog = JSON.parse(await readFile(
  join(projectRoot, 'battle-top-designer', 'shared', 'nss', 'parts.catalog.json'),
  'utf8',
));

await mkdir(target, { recursive: true });
for (const part of catalog.parts) {
  await copyFile(join(source, `${part.id}.glb`), join(target, `${part.id}.glb`));
}
console.log(`Copied ${catalog.parts.length} NSS models to ${target}`);
