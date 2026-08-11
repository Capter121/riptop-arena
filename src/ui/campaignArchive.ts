import type { LocalIdentity } from '../auth/localIdentity';
import {
  type CampaignArchiveOpponent,
  type CampaignClient,
} from '../campaign/campaignClient';
import {
  createPendingCampaignRetrySession,
  listPendingCampaignResults,
  retryPendingCampaignResultsOnce,
} from '../campaign/pendingCampaignResult';
import type { CampaignOutcome } from '../data/campaign/campaignRules';
import { campaignObjectiveText } from '../data/campaign/objectives';
import { progressionFromServer, saveProgression, type ProgressionState } from '../app/progression';
import { mountCampaignPreview } from './campaignPreview';
import { buildCampaignCustomizerPath } from '../campaign/campaignReturn';
import { commitProgressionSync } from '../progression/progressionClient';
import type { CampaignSettlement } from '../campaign/campaignClient';

type CampaignCardState = 'locked' | 'available' | 'defeated';
const retrySession = createPendingCampaignRetrySession();

const FINISH_LABELS: Record<CampaignOutcome['kind'], string> = {
  'ring out': '场外终结',
  'spin finish': '旋转终结',
  'burst finish': '爆裂终结',
  timeout: '超时终结',
};

const ARENA_LABELS = {
  classic_grid: '经典格斗场',
  neon_magma: '霓虹熔岩场',
  absolute_zero: '绝对零度场',
} as const;

const AI_LABELS = {
  assault: '强攻',
  skirmisher: '游击',
  control: '控制',
  sustain: '续航',
  ringout: '场外压制',
  counter: '反击',
  mixup: '混合博弈',
  fortress: '堡垒',
} as const;

export function campaignCardStatus(opponent: Pick<CampaignArchiveOpponent, 'unlocked' | 'defeated'>): CampaignCardState {
  if (!opponent.unlocked) return 'locked';
  return opponent.defeated ? 'defeated' : 'available';
}

export function campaignStarStates(mask: number): readonly [boolean, boolean, boolean] {
  return [Boolean(mask & 1), Boolean(mask & 2), Boolean(mask & 4)];
}

export function campaignBestText(outcome: CampaignOutcome | null): string {
  if (!outcome) return '尚无胜利记录';
  return `${outcome.turnCount} 回合 · ${FINISH_LABELS[outcome.kind]} · 完整度 ${Math.round(outcome.player.integrity)}`;
}

function starMarkup(mask: number) {
  return campaignStarStates(mask).map((earned, index) => (
    `<span class="campaign-star${earned ? ' campaign-star--earned' : ''}" aria-label="${index === 0 ? '胜利' : index === 1 ? '策略' : '表现'}星${earned ? '已获得' : '未获得'}">★</span>`
  )).join('');
}

function rewardText(opponent: CampaignArchiveOpponent) {
  const rewards = [`首胜 ${opponent.rewards.firstWinCoins} 金币`, `每颗星 ${opponent.rewards.starCoins} 金币`];
  if (opponent.rewards.unlockPartId) rewards.push(`零件 ${opponent.rewards.unlockPartId}`);
  if (opponent.rewards.championshipCrowns) rewards.push('冠军王冠');
  return rewards.join(' · ');
}

export function campaignPortalText(totalStars: number, nextOpponentName: string, pendingCount: number) {
  return `${totalStars} / 24 星 · 当前 ${nextOpponentName}${pendingCount ? ` · ${pendingCount} 待同步` : ''}`;
}

export function selectedCampaignOpponentId(
  opponents: readonly CampaignArchiveOpponent[],
  nextOpponentId: string,
  requested: string | null,
) {
  return opponents.some(opponent => opponent.id === requested && opponent.unlocked) ? requested! : nextOpponentId;
}

export async function renderCampaignArchive(
  mount: HTMLElement,
  identity: LocalIdentity,
  progression: ProgressionState,
  client: CampaignClient,
) {
  mount.setAttribute('aria-busy', 'true');
  mount.innerHTML = '<main class="campaign-page campaign-page--loading"><p role="status">正在读取对手档案…</p></main>';
  let recoveredSettlement: CampaignSettlement | null = null;
  await retryPendingCampaignResultsOnce(
    identity.playerId,
    async (attemptId, value) => {
      const settlement = await client.submitResult(attemptId, value);
      recoveredSettlement = settlement;
      return settlement;
    },
    { session: retrySession },
  );
  if (recoveredSettlement) {
    const settlement = recoveredSettlement as CampaignSettlement;
    progression = progressionFromServer(settlement.progression.snapshot, settlement.progression.coins);
    saveProgression(progression, { trackWallet: false });
    commitProgressionSync(identity, { status: 'synced', progression: settlement.progression, acknowledgedEventIds: [] });
  }

  let archive;
  try {
    archive = await client.getArchive();
  } catch {
    mount.innerHTML = `
      <main class="campaign-page campaign-page--error" role="status">
        <p class="portal-eyebrow">RIVAL ARCHIVE</p>
        <h1>暂时无法读取战役进度</h1>
        <p>本地身份仍然保留，请检查连接后重试。</p>
        <div class="campaign-error-actions"><button type="button">重试</button><a href="/">返回据点</a></div>
      </main>`;
    mount.querySelector('button')?.addEventListener('click', () => void renderCampaignArchive(mount, identity, progression, client));
    mount.removeAttribute('aria-busy');
    return;
  }

  const pending = listPendingCampaignResults(identity.playerId);
  const pendingCount = pending.filter(item => item.status === 'pending').length;
  const conflictCount = pending.filter(item => item.status === 'conflict').length;
  let selectedId = selectedCampaignOpponentId(
    archive.opponents,
    archive.nextOpponentId,
    new URLSearchParams(window.location.search).get('opponent'),
  );
  let disposePreview: (() => void) | null = null;

  mount.innerHTML = `
    <main class="campaign-page">
      <a class="campaign-back" href="/">← 返回私人竞技据点</a>
      <header class="campaign-header">
        <div><p class="portal-eyebrow">RIVAL ARCHIVE / CAMPAIGN V1</p><h1>八人战役档案馆</h1><p>逐一击败对手；胜利、策略与表现三颗星可以分多次完成。</p></div>
        <strong>${identity.displayName}</strong>
      </header>
      <section class="campaign-summary" aria-label="战役总览">
        <div><span>战役星数</span><strong>${archive.totalStars} / 24</strong></div>
        <div><span>当前目标</span><strong>${archive.opponents.find(item => item.id === archive.nextOpponentId)?.name ?? '已通关'}</strong></div>
        <div><span>冠军王冠</span><strong>${archive.championshipCount}</strong></div>
        <div><span>待同步结果</span><strong>${pendingCount}${conflictCount ? ` · ${conflictCount} 冲突` : ''}</strong></div>
      </section>
      <section class="campaign-layout">
        <nav class="campaign-roster" aria-label="战役对手"></nav>
        <section class="campaign-detail" aria-live="polite"></section>
      </section>
    </main>`;

  const roster = mount.querySelector<HTMLElement>('.campaign-roster');
  const detail = mount.querySelector<HTMLElement>('.campaign-detail');
  if (!roster || !detail) throw new Error('Campaign archive mount failed');

  const renderDetail = () => {
    disposePreview?.();
    disposePreview = null;
    const opponent = archive.opponents.find(item => item.id === selectedId) ?? archive.opponents[0];
    const hasLoadout = progression.latestNssLoadout !== null;
    detail.innerHTML = `
      <div class="campaign-preview" role="img" aria-label="${opponent.name} 的陀螺 3D 预览"><span>正在装配 3D 预览…</span></div>
      <div class="campaign-dossier">
        <p class="campaign-index">RIVAL ${String(opponent.index + 1).padStart(2, '0')} · ${opponent.theme}</p>
        <h2>${opponent.name}</h2>
        <div class="campaign-detail-stars" aria-label="已获得星级">${starMarkup(opponent.starsMask)}</div>
        <p>${opponent.description}</p>
        <dl class="campaign-stats">
          <div><dt>核心</dt><dd>${opponent.coreAffinity === 'LIGHT' ? '光' : '暗'}</dd></div>
          <div><dt>流派</dt><dd>${AI_LABELS[opponent.aiProfileId]}</dd></div>
          <div><dt>固定强化</dt><dd>攻 ${opponent.upgrades.attack} / 防 ${opponent.upgrades.defense} / 耐 ${opponent.upgrades.stamina}</dd></div>
          <div><dt>竞技场</dt><dd>${opponent.arenas.map(arena => ARENA_LABELS[arena]).join(' / ')}</dd></div>
        </dl>
        <section class="campaign-brief"><h3>战术情报</h3><p>${opponent.tutorial}</p></section>
        <section class="campaign-objectives"><h3>三星目标</h3><ol><li>赢得战斗</li><li>${campaignObjectiveText(opponent.objectives.strategy)}</li><li>${campaignObjectiveText(opponent.objectives.performance)}</li></ol></section>
        <p class="campaign-best"><strong>最佳记录</strong><span>${campaignBestText(opponent.bestOutcome)}</span></p>
        <p class="campaign-reward"><strong>奖励</strong><span>${rewardText(opponent)}</span></p>
        <div class="campaign-actions">
          ${hasLoadout ? `<a class="campaign-primary" href="/arena/?campaign=${encodeURIComponent(opponent.id)}">挑战 ${opponent.name}</a>` : '<span class="campaign-action-disabled" aria-disabled="true">需要先完成一套 NSS 装配</span>'}
          <a href="${buildCampaignCustomizerPath(opponent.id, progression.latestNssLoadout)}">调整我的装配</a>
        </div>
      </div>`;
    const preview = detail.querySelector<HTMLElement>('.campaign-preview');
    if (preview) disposePreview = mountCampaignPreview(preview, opponent.loadouts[0]);
  };

  for (const opponent of archive.opponents) {
    const status = campaignCardStatus(opponent);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `campaign-rival campaign-rival--${status}`;
    button.disabled = status === 'locked';
    button.dataset.opponentId = opponent.id;
    button.setAttribute('aria-pressed', String(opponent.id === selectedId));
    button.innerHTML = `<span class="campaign-rival-index">${String(opponent.index + 1).padStart(2, '0')}</span><span><strong>${opponent.name}</strong><small>${status === 'locked' ? '击败上一位对手后解锁' : opponent.theme}</small></span><span class="campaign-rival-stars">${starMarkup(opponent.starsMask)}</span>`;
    button.addEventListener('click', () => {
      selectedId = opponent.id;
      roster.querySelectorAll<HTMLButtonElement>('.campaign-rival').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      const url = new URL(window.location.href);
      url.searchParams.set('opponent', opponent.id);
      window.history.replaceState(null, '', `${url.pathname}${url.search}`);
      renderDetail();
    });
    roster.append(button);
  }
  renderDetail();
  mount.removeAttribute('aria-busy');
}
