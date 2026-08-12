import {
  loadProgression,
  progressionFromServer,
  saveProgression,
  setNssLoadout,
  type ProgressionState,
} from '../app/progression';
import { InviteApiError, fetchCurrentPlayer, redeemInvite, type PublicPlayer } from '../auth/inviteClient';
import {
  clearLocalIdentity,
  loadLocalIdentity,
  probeIdentityStorage,
  saveLocalIdentity,
  type LocalIdentity,
} from '../auth/localIdentity';
import { PARTS, type PartSlot } from '../data/parts';
import { nssCombinationId } from '../nss/loadout';
import {
  ProgressionSyncError,
  commitProgressionSync,
  syncPlayerProgression,
} from '../progression/progressionClient';
import { InviteGate } from './inviteGate';
import { createChallengeClient } from '../challenges/challengeClient';
import { renderChallengeCenter } from './challengeCenter';
import { renderChallengeOffer } from './challengeOffer';
import { parseChallengeReturn, type ChallengeReturnParseResult } from '../challenges/challengeReturn';
import { createCampaignClient } from '../campaign/campaignClient';
import { listPendingCampaignResults } from '../campaign/pendingCampaignResult';
import { campaignPortalText, renderCampaignArchive } from './campaignArchive';
import { parseCampaignReturn, type CampaignReturnParseResult } from '../campaign/campaignReturn';
import { createSurvivalClient } from '../survival/survivalClient';
import { renderSurvivalCenter } from './survivalCenter';

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
  { id: 'friend-challenge', title: '好友挑战', status: 'open', href: '/challenges/' },
  { id: 'campaign', title: '八人战役', status: 'open', href: '/campaign/' },
  { id: 'survival', title: '生存模式', status: 'open', href: '/survival/' },
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
  if ((error instanceof InviteApiError || error instanceof ProgressionSyncError)
    && (error.status === 401 || error.status === 403)) {
    return 'invalid-identity';
  }
  return 'offline';
}

function inviteCodeFromLocation() {
  return new URLSearchParams(window.location.search).get('invite')?.trim() ?? '';
}

function removeInviteParameter() {
  const url = new URL(window.location.href);
  url.searchParams.delete('invite');
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

type PortalSyncStatus = 'synced' | 'pending' | 'conflict' | 'error';

const SYNC_STATUS_LABELS: Record<PortalSyncStatus, string> = {
  synced: '进度已同步',
  pending: '进度待同步',
  conflict: '金币冲突已恢复',
  error: '进度同步错误',
};

function renderAuthenticated(
  mount: HTMLElement,
  player: PublicPlayer,
  progression: ProgressionState,
  syncStatus: PortalSyncStatus,
  identity: LocalIdentity,
) {
  const client = createChallengeClient(identity);
  const campaignClient = createCampaignClient(identity);
  if (window.location.pathname === '/survival' || window.location.pathname === '/survival/') {
    void renderSurvivalCenter(mount, identity, progression, createSurvivalClient(identity));
    return;
  }
  if (window.location.pathname === '/campaign' || window.location.pathname === '/campaign/') {
    void renderCampaignArchive(mount, identity, progression, campaignClient);
    return;
  }
  const offerMatch = /^\/challenge\/([0-9a-f-]{36})\/?$/.exec(window.location.pathname);
  if (offerMatch) {
    void renderChallengeOffer(mount, identity, client, offerMatch[1], progression);
    return;
  }
  if (window.location.pathname === '/challenges' || window.location.pathname === '/challenges/') {
    void renderChallengeCenter(mount, identity, progression, client);
    return;
  }
  mount.innerHTML = `
    <main class="portal-shell">
      <header class="portal-header">
        <div>
          <p class="portal-eyebrow">PRIVATE SERVER</p>
          <p class="portal-product">Nova Spin System</p>
          <h1>私人竞技据点</h1>
        </div>
        <div class="portal-identity">
          <span>本地身份已验证</span>
          <strong class="portal-player-name"></strong>
          <span class="portal-sync-status"></span>
        </div>
      </header>
      <section class="portal-summary" aria-label="玩家摘要">
        <div><span>金币</span><strong class="portal-coins"></strong></div>
        <div><span>当前配装</span><strong class="portal-build"></strong></div>
      </section>
      <section class="portal-modes" aria-label="游戏模式"></section>
    </main>
  `;
  const playerName = mount.querySelector<HTMLElement>('.portal-player-name');
  const coins = mount.querySelector<HTMLElement>('.portal-coins');
  const build = mount.querySelector<HTMLElement>('.portal-build');
  const sync = mount.querySelector<HTMLElement>('.portal-sync-status');
  const modes = mount.querySelector<HTMLElement>('.portal-modes');
  if (!playerName || !coins || !build || !sync || !modes) throw new Error('Portal mount failed');
  playerName.textContent = player.displayName;
  coins.textContent = String(progression.coins);
  build.textContent = createBuildSummary(progression);
  sync.textContent = SYNC_STATUS_LABELS[syncStatus];

  for (const mode of PORTAL_MODES) {
    const entry = document.createElement(mode.status === 'open' ? 'a' : 'div');
    entry.className = `portal-mode portal-mode--${mode.status}`;
    entry.dataset.modeId = mode.id;
    if (mode.href && entry instanceof HTMLAnchorElement) entry.href = mode.href;
    if (mode.status === 'locked') entry.setAttribute('aria-disabled', 'true');
    const title = document.createElement('strong');
    title.textContent = mode.title;
    const detail = document.createElement('span');
    detail.textContent = mode.status === 'open' ? '进入' : mode.unlockCondition ?? '';
    entry.append(title, detail);
    modes.append(entry);
  }
  const challengeMode = modes.querySelector<HTMLElement>('[data-mode-id="friend-challenge"]');
  void client.listChallenges({ group: 'waiting_me', limit: 20 }).then(result => {
    if (!challengeMode || result.pendingCount < 1) return;
    const badge = document.createElement('span');
    badge.className = 'portal-mode-badge';
    badge.textContent = result.pendingCount > 99 ? '99+' : String(result.pendingCount);
    badge.setAttribute('aria-label', `${result.pendingCount} 个待处理挑战`);
    challengeMode.append(badge);
  }).catch(() => { /* Challenge status must not block other portal modes. */ });
  const campaignMode = modes.querySelector<HTMLElement>('[data-mode-id="campaign"]');
  const campaignDetail = campaignMode?.querySelector<HTMLElement>('span');
  const pendingCampaignCount = listPendingCampaignResults(identity.playerId).length;
  void campaignClient.getArchive().then(archive => {
    if (!campaignDetail) return;
    const next = archive.opponents.find(opponent => opponent.id === archive.nextOpponentId);
    campaignDetail.textContent = campaignPortalText(archive.totalStars, next?.name ?? '已通关', pendingCampaignCount);
  }).catch(() => {
    if (campaignDetail && pendingCampaignCount) campaignDetail.textContent = `${pendingCampaignCount} 个结果待同步`;
  });
  mount.removeAttribute('aria-busy');
}

async function syncAndRender(mount: HTMLElement, player: PublicPlayer, identity: LocalIdentity) {
  let localProgression = loadProgression();
  const isChallengeOffer = /^\/challenge\/[0-9a-f-]{36}\/?$/.test(window.location.pathname);
  const challengeReturn: ChallengeReturnParseResult = isChallengeOffer
    ? parseChallengeReturn(window.location.search)
    : { kind: 'none' };
  const isCampaignArchive = window.location.pathname === '/campaign' || window.location.pathname === '/campaign/';
  const campaignReturn: CampaignReturnParseResult = isCampaignArchive
    ? parseCampaignReturn(window.location.search)
    : { kind: 'none' };
  mount.setAttribute('aria-busy', 'true');
  if (challengeReturn.kind === 'invalid' || campaignReturn.kind === 'invalid') {
    renderChallengeReturnPending(mount, '返回参数无效，请从原页面重新进入定制器。');
    return;
  }
  const returnedLoadout = challengeReturn.kind === 'ready'
    ? challengeReturn.loadout
    : campaignReturn.kind === 'ready' ? campaignReturn.loadout : null;
  if (returnedLoadout) {
    localProgression = setNssLoadout(localProgression, returnedLoadout);
    saveProgression(localProgression, { trackWallet: false });
  }
  try {
    const result = await syncPlayerProgression(identity, localProgression);
    const authoritative = progressionFromServer(result.progression.snapshot, result.progression.coins);
    saveProgression(authoritative, { trackWallet: false });
    commitProgressionSync(identity, result);
    if (returnedLoadout) {
      const returnPath = campaignReturn.kind === 'ready'
        ? `/campaign/?opponent=${encodeURIComponent(campaignReturn.opponentId)}`
        : window.location.pathname;
      window.history.replaceState(null, '', returnPath);
    }
    renderAuthenticated(mount, player, authoritative, result.status === 'conflict' ? 'conflict' : 'synced', identity);
  } catch (error) {
    if (classifyPortalFailure(error) === 'invalid-identity') {
      clearLocalIdentity();
      renderGuest(mount, '本地身份已失效，请使用新的邀请码。');
      return;
    }
    if (returnedLoadout) {
      renderChallengeReturnPending(mount, '新装配尚未同步，认领已暂停。请联网后重试。');
      return;
    }
    const fallback = loadProgression();
    renderAuthenticated(
      mount,
      player,
      fallback,
      error instanceof ProgressionSyncError && error.status === 400 ? 'error' : 'pending',
      identity,
    );
  }
}

function renderChallengeReturnPending(mount: HTMLElement, message: string) {
  mount.innerHTML = `
    <main class="portal-state" role="status">
      <p class="portal-eyebrow">LOADOUT SYNC REQUIRED</p>
      <h1>暂时不能认领挑战</h1>
      <p></p>
      <button type="button">重新同步装配</button>
    </main>
  `;
  const text = mount.querySelector('p:last-of-type');
  if (text) text.textContent = message;
  mount.querySelector('button')?.addEventListener('click', () => window.location.reload());
  mount.removeAttribute('aria-busy');
}

function renderOffline(mount: HTMLElement, retry: () => void) {
  mount.innerHTML = `
    <main class="portal-state" role="status">
      <p class="portal-eyebrow">CONNECTION INTERRUPTED</p>
      <h1>暂时无法连接私人服务器</h1>
      <p>本地身份仍保留在这台浏览器中。</p>
      <button type="button">重试连接</button>
    </main>
  `;
  mount.querySelector('button')?.addEventListener('click', retry);
  mount.removeAttribute('aria-busy');
}

function renderGuest(mount: HTMLElement, initialError = '') {
  const gate = new InviteGate({
    inviteCode: inviteCodeFromLocation(),
    onSubmit: async (input, currentGate) => {
      if (!probeIdentityStorage()) {
        currentGate.setError('浏览器无法保存身份，请允许本地存储后重试。');
        return;
      }
      try {
        const identity = await redeemInvite(input);
        const complete = () => {
          removeInviteParameter();
          void syncAndRender(mount, identity, identity);
        };
        if (!saveLocalIdentity(identity)) {
          currentGate.showSaveRetry(() => {
            if (!saveLocalIdentity(identity)) return false;
            complete();
            return true;
          });
          return;
        }
        complete();
      } catch (error) {
        currentGate.setError(error instanceof InviteApiError
          ? error.message
          : '暂时无法验证邀请，请稍后重试。');
      }
    },
  });
  mount.replaceChildren(gate.element);
  if (initialError) gate.setError(initialError);
  mount.removeAttribute('aria-busy');
}

async function restoreIdentity(mount: HTMLElement, identity: LocalIdentity) {
  mount.setAttribute('aria-busy', 'true');
  mount.innerHTML = '<main class="portal-state"><p role="status">正在验证本地身份…</p></main>';
  try {
    await syncAndRender(mount, await fetchCurrentPlayer(identity), identity);
  } catch (error) {
    if (classifyPortalFailure(error) === 'invalid-identity') {
      clearLocalIdentity();
      renderGuest(mount, '本地身份已失效，请使用新的邀请码。');
      return;
    }
    renderOffline(mount, () => { void restoreIdentity(mount, identity); });
  }
}

export async function startPortal(mount: HTMLElement) {
  const identity = loadLocalIdentity();
  if (!identity) {
    renderGuest(mount);
    return;
  }
  await restoreIdentity(mount, identity);
}
