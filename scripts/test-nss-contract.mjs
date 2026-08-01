import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../battle-top-designer/shared/nss/', import.meta.url);
const catalog = JSON.parse(await readFile(new URL('parts.catalog.json', root), 'utf8'));
const schema = JSON.parse(await readFile(new URL('loadout.schema.json', root), 'utf8'));
const battleCatalogText = await readFile(new URL('battle-parts.json', root), 'utf8');
const battleCatalog = JSON.parse(battleCatalogText);
const battleSchema = JSON.parse(await readFile(new URL('battle-parts.schema.json', root), 'utf8'));
const versions = JSON.parse(await readFile(new URL('versions.json', root), 'utf8'));
const families = ['core', 'blade', 'assist', 'gear', 'tip'];
const expectedCounts = { core: 2, blade: 4, assist: 3, gear: 3, tip: 4 };
const versionKeys = ['affinityRulesVersion', 'battleRulesVersion', 'catalogVersion', 'challengeSchemaVersion', 'saveSchemaVersion'];

assert.deepEqual(Object.keys(versions).sort(), versionKeys);
for (const version of Object.values(versions)) assert.equal(version, 1);

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
assert.equal(battleCatalog.schemaVersion, 1);
assert.equal(battleCatalog.parts.length, 16);
assert.equal(new Set(battleCatalog.parts.map(part => part.id)).size, 16);
assert.deepEqual(
  battleCatalog.parts.map(part => part.id).sort(),
  catalog.parts.map(part => part.id).sort(),
);
assert.equal(battleSchema.additionalProperties, false);
assert.equal(createHash('sha256').update(battleCatalogText.replace(/\r\n/g, '\n')).digest('hex'), '180ab25494b1f4249644159379202ea8f8a631608d3c804d8c47a2ecac918b1d');
for (const part of battleCatalog.parts) {
  assert.equal(catalog.parts.find(entry => entry.id === part.id)?.family, part.family);
  assert.ok(part.physics.weight > 0);
  assert.equal(part.family === 'blade', part.physics.collisionRadius > 0);
  for (const value of Object.values(part.stats)) assert.ok(Number.isFinite(value) && value >= 0);
}

const combinations = expectedCounts.core * expectedCounts.blade * expectedCounts.assist * expectedCounts.gear * expectedCounts.tip;
assert.equal(combinations, 288);
console.log(`NSS shared contract PASS: ${catalog.parts.length} parts, ${combinations} combinations`);
