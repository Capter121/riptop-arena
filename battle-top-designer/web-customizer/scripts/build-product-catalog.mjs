import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const project = resolve(import.meta.dirname, '../..');
const partDir = resolve(project, 'specs/parts');
const outputs = [
  resolve(import.meta.dirname, '../src/generated/parts.catalog.json'),
  resolve(project, 'shared/nss/parts.catalog.json'),
];
const typeToFamily = {
  emblem_core: 'core', main_blade: 'blade', assist_ring: 'assist',
  height_gear: 'gear', performance_tip: 'tip',
};
const expectedCounts = { core: 2, blade: 4, assist: 3, gear: 3, tip: 4 };
const files = (await readdir(partDir)).filter(name => name.endsWith('.json')).sort();
const parts = [];
for (const file of files) {
  const bytes = await readFile(resolve(partDir, file));
  const canonicalBytes = Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n'), 'utf8');
  const spec = JSON.parse(canonicalBytes.toString('utf8'));
  const family = typeToFamily[spec.part_type];
  if (!family || spec.interface_id !== 'NSS-V1') throw new Error(`Invalid protected spec: ${file}`);
  parts.push({
    id: spec.id,
    displayName: spec.display_name,
    family,
    partType: spec.part_type,
    interfaceId: spec.interface_id,
    heightMm: spec.dimensions.height_mm,
    specSha256: createHash('sha256').update(canonicalBytes).digest('hex'),
  });
}
for (const [family, count] of Object.entries(expectedCounts)) {
  if (parts.filter(part => part.family === family).length !== count) throw new Error(`Wrong ${family} count`);
}
const catalog = { schemaVersion: 1, parts };
const rendered = `${JSON.stringify(catalog, null, 2)}\n`;
if (process.argv.includes('--check')) {
  for (const output of outputs) {
    const current = await readFile(output, 'utf8');
    if (current !== rendered) throw new Error(`Generated catalog is stale: ${output}`);
  }
} else {
  for (const output of outputs) await writeFile(output, rendered);
}
console.log(`catalog ${process.argv.includes('--check') ? 'verified' : 'generated'}: ${parts.length} parts, ${outputs.length} outputs`);
