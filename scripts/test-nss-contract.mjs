import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../battle-top-designer/shared/nss/', import.meta.url);
const catalog = JSON.parse(await readFile(new URL('parts.catalog.json', root), 'utf8'));
const schema = JSON.parse(await readFile(new URL('loadout.schema.json', root), 'utf8'));
const families = ['core', 'blade', 'assist', 'gear', 'tip'];
const expectedCounts = { core: 2, blade: 4, assist: 3, gear: 3, tip: 4 };

assert.equal(catalog.schemaVersion, 1);
assert.equal(catalog.parts.length, 16);
assert.equal(new Set(catalog.parts.map(part => part.id)).size, 16);
for (const family of families) {
  assert.equal(catalog.parts.filter(part => part.family === family).length, expectedCounts[family]);
}
for (const part of catalog.parts) assert.equal(part.interfaceId, 'NSS-V1');
assert.equal(schema.additionalProperties, false);
assert.deepEqual(schema.required, ['schemaVersion', 'interfaceId', 'combination']);
assert.deepEqual(schema.properties.combination.required, families);
assert.equal(schema.properties.combination.additionalProperties, false);
assert.equal(schema.properties.interfaceId.const, 'NSS-V1');

const combinations = expectedCounts.core * expectedCounts.blade * expectedCounts.assist * expectedCounts.gear * expectedCounts.tip;
assert.equal(combinations, 288);
console.log(`NSS shared contract PASS: ${catalog.parts.length} parts, ${combinations} combinations`);
