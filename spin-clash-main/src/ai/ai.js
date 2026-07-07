// Rule-based AI opponent (PRD ch.18 Q-AI: v1.0 rule-based).
// 4 preset faction builds; launch chosen by faction; arena left to the player.

import { factionForBuild } from '../render/factions.js';
import { sampleZone } from '../data/launch.js';

export const AI_BUILDS = [
  { name: '烈焰武士', ids: ['ring_inferno', 'driver_inferno', 'disc_inferno', 'core_inferno'] },
  { name: '磐石守衛', ids: ['ring_bedrock', 'driver_bedrock', 'disc_bedrock', 'core_bedrock'] },
  { name: '疾風遊俠', ids: ['ring_gale', 'driver_gale', 'disc_gale', 'core_gale'] },
  { name: '混沌使者', ids: ['ring_chaos', 'driver_chaos', 'disc_chaos', 'core_chaos'] },
  // a mixed bruiser to vary the meta
  { name: '熔岩風暴', ids: ['ring_inferno', 'driver_gale', 'disc_inferno', 'core_chaos'] },
];

export function pickAIBuild(rng) {
  const i = Math.floor(rng.float() * AI_BUILDS.length);
  return AI_BUILDS[i];
}

// Choose a launch technique that suits the build's faction, then sample timing.
export function pickAILaunch(ids, rng) {
  const faction = factionForBuild(ids);
  let techniqueId = 'steady';
  let stance = 'center';
  if (faction === 'inferno' || faction === 'chaos') techniqueId = 'power';
  else if (faction === 'gale') techniqueId = 'spin_slide';
  else techniqueId = 'steady';
  const zoneId = sampleZone(techniqueId, () => rng.float());
  return { techniqueId, zoneId, stance };
}
