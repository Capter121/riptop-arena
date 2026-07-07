// Friend-battle share links: encode a top build + inviter name into a URL the
// friend opens (mode=battle), and decode it back, randomly filling any missing
// or invalid parts.

import { COMPONENTS_BY_ID, componentsForSlot, SLOTS } from '../data/components.js';

// Keep at most 4 characters (by code point, so CJK count as 1 each).
export function sanitizeName(raw) {
  const s = (raw || '').replace(/\s+/g, ' ').trim();
  return Array.from(s).slice(0, 4).join('');
}

export function buildChallengeUrl(build, name) {
  const p = new URLSearchParams();
  p.set('mode', 'battle');
  p.set('name', sanitizeName(name));
  p.set('build', build.join(','));
  return `${location.origin}${location.pathname}?${p.toString()}`;
}

// Returns { inviterName, inviterBuild } or null if not a challenge URL.
export function decodeChallenge(search) {
  const p = new URLSearchParams(search);
  if (p.get('mode') !== 'battle') return null;
  const inviterName = sanitizeName(p.get('name') || '') || '你的好友';

  const raw = (p.get('build') || '').split(',');
  const bySlot = {};
  for (const id of raw) {
    const c = COMPONENTS_BY_ID[id.trim()];
    if (c && !bySlot[c.slot]) bySlot[c.slot] = c.id;
  }
  // One valid component per slot A/B/C/D; random fill anything missing/invalid.
  const inviterBuild = SLOTS.map((slot) => {
    if (bySlot[slot.id]) return bySlot[slot.id];
    const opts = componentsForSlot(slot.id);
    return opts[Math.floor(Math.random() * opts.length)].id;
  });
  return { inviterName, inviterBuild };
}
