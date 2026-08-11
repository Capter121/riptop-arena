import assert from 'node:assert/strict';
import { CAMPAIGN_CATALOG, assertCampaignCatalog } from '../server/campaign/campaign-catalog.mjs';
import { campaignEventUuid, campaignWinCoins, selectCampaignRotation } from '../shared/campaign/campaign-rules.js';

assert.doesNotThrow(() => assertCampaignCatalog(CAMPAIGN_CATALOG));
assert.equal(CAMPAIGN_CATALOG.configVersion, 'campaign-v1');
assert.equal(CAMPAIGN_CATALOG.opponents.length, 8);
assert.equal(CAMPAIGN_CATALOG.opponents.flatMap(opponent => opponent.loadouts).length, 17);
assert.deepEqual(
  CAMPAIGN_CATALOG.opponents.map(opponent => opponent.id),
  ['blaze-fang', 'sky-gale', 'abyss-tide', 'forest-crown', 'rift-drift', 'dawn-verdict', 'night-eclipse', 'atlas-guardian'],
);
assert.deepEqual(selectCampaignRotation(4, 3, 3), { loadoutIndex: 1, arenaIndex: 1 });
assert.equal(campaignWinCoins(7, 'timeout'), 565);
assert.match(campaignEventUuid('campaign:atlas-guardian:championship'), /^[0-9a-f-]{36}$/);

console.log('Campaign catalog contract tests passed.');
