import type { ProgressionState } from '../app/progression';
import { InviteApiError } from '../auth/inviteClient';
import { PARTS, type PartSlot } from '../data/parts';
import { nssCombinationId } from '../nss/loadout';

export interface PortalMode {
  readonly id: string;
  readonly title: string;
  readonly status: 'open' | 'locked';
  readonly href?: string;
  readonly unlockCondition?: string;
}

export const PORTAL_MODES: readonly PortalMode[] = [
  { id: 'customizer', title: 'NSS 定制器', status: 'open', href: './customizer/' },
  { id: 'arena', title: 'RIPTOP Arena', status: 'open', href: './arena/' },
  { id: 'friend-challenge', title: '好友挑战', status: 'locked', unlockCondition: '阶段 5 解锁' },
  { id: 'campaign', title: '八人战役', status: 'locked', unlockCondition: '阶段 6 解锁' },
  { id: 'survival', title: '生存模式', status: 'locked', unlockCondition: '阶段 7 解锁' },
  { id: 'emblem-workshop', title: '纹章工坊', status: 'locked', unlockCondition: '阶段 8 解锁' },
];

const LEGACY_SLOT_ORDER: readonly PartSlot[] = ['attackRing', 'core', 'driver'];

export function createBuildSummary(progression: ProgressionState): string {
  if (progression.latestNssLoadout) {
    return `NSS · ${nssCombinationId(progression.latestNssLoadout.combination)}`;
  }
  return LEGACY_SLOT_ORDER.map(slot => (
    PARTS[slot].find(part => part.id === progression.build[slot])?.name ?? progression.build[slot]
  )).join(' / ');
}

export function classifyPortalFailure(error: unknown): 'invalid-identity' | 'offline' {
  if (error instanceof InviteApiError && (error.status === 401 || error.status === 403)) {
    return 'invalid-identity';
  }
  return 'offline';
}
