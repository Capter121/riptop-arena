import assert from 'node:assert/strict';
import { CAMPAIGN_CATALOG, assertCampaignCatalog } from '../server/campaign/campaign-catalog.mjs';

assert.doesNotThrow(() => assertCampaignCatalog(CAMPAIGN_CATALOG));
assert.equal(CAMPAIGN_CATALOG.configVersion, 'campaign-v1');
assert.equal(CAMPAIGN_CATALOG.opponents.length, 8);
assert.equal(CAMPAIGN_CATALOG.opponents.flatMap(opponent => opponent.loadouts).length, 17);
assert.deepEqual(
  CAMPAIGN_CATALOG.opponents.map(opponent => opponent.id),
  ['blaze-fang', 'sky-gale', 'abyss-tide', 'forest-crown', 'rift-drift', 'dawn-verdict', 'night-eclipse', 'atlas-guardian'],
);

console.log('Campaign catalog contract tests passed.');
