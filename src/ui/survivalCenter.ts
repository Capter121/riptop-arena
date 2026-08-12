import type { ProgressionState } from '../app/progression';
import type { LocalIdentity } from '../auth/localIdentity';
import { nssCombinationId } from '../nss/loadout';
import type {
  SurvivalBest,
  SurvivalClient,
  SurvivalHistoryEntry,
  SurvivalLeaderboardEntry,
} from '../survival/survivalClient';

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = '') {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

function score(value: number) { return value.toLocaleString('zh-CN'); }
function loadout(value: SurvivalBest['loadoutSummary']) { return nssCombinationId(value.combination); }
function date(value: string) { return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }

export function mergeSurvivalLeaderboard(current: SurvivalLeaderboardEntry[], next: SurvivalLeaderboardEntry[]) {
  const ids = new Set(current.map(entry => entry.playerId));
  return [...current, ...next.filter(entry => !ids.has(entry.playerId))];
}

export function mergeSurvivalHistory(current: SurvivalHistoryEntry[], next: SurvivalHistoryEntry[]) {
  const ids = new Set(current.map(entry => entry.runId));
  return [...current, ...next.filter(entry => !ids.has(entry.runId))];
}

function bestMetrics(best: SurvivalBest) {
  return `第 ${best.highestCompletedWave} 波 · ${best.bossesDefeated} BOSS · 完整度 ${Math.round(best.finalIntegrity)} · 风险 ${best.riskLevel}`;
}

export async function renderSurvivalCenter(
  mount: HTMLElement,
  identity: LocalIdentity,
  progression: ProgressionState,
  client: SurvivalClient,
) {
  mount.innerHTML = `<main class="survival-center"><section class="survival-center__loading"><p>正在读取生存检查点…</p></section></main>`;
  let hub;
  try {
    hub = await client.getHub();
  } catch {
    mount.innerHTML = `<main class="survival-center"><section class="survival-center__empty"><h1>生存中心暂时离线</h1><p>身份仍保存在本机，恢复网络后可以重试。</p><button class="survival-center__primary" type="button">重新加载</button><a href="/">返回竞技据点</a></section></main>`;
    mount.querySelector('button')?.addEventListener('click', () => { void renderSurvivalCenter(mount, identity, progression, client); });
    return;
  }

  const active = hub.activeRun;
  const best = hub.personalBest;
  mount.innerHTML = `
    <main class="survival-center">
      <header class="survival-center__header">
        <div><p class="portal-eyebrow">SURVIVAL NETWORK</p><h1>无尽生存中心</h1><p class="survival-center__identity"></p></div>
        <a href="/">返回竞技据点</a>
      </header>
      <section class="survival-center__command">
        <div class="survival-center__run">
          <p class="survival-center__label">${active ? 'ACTIVE CHECKPOINT' : 'NEW RUN'}</p>
          <h2>${active ? `第 ${active.wave.wave} 波 · ${active.wave.type === 'boss' ? 'BOSS' : active.wave.type === 'elite' ? '精英' : '普通'}` : '准备新的生存运行'}</h2>
          <p>${active ? `累计 ${score(active.checkpoint.score)} · 完整度 ${Math.round(active.checkpoint.integrity)}/${Math.round(active.player.maximumIntegrity)} · 爆裂 ${Math.round(active.checkpoint.burstRisk)}% · 风险 ${active.checkpoint.riskLevel}` : progression.latestNssLoadout ? `当前装配 · ${nssCombinationId(progression.latestNssLoadout.combination)}` : '尚未同步有效的 NSS 五件装配'}</p>
          <p class="survival-center__loadout">${active ? `冻结装配 · ${nssCombinationId(active.player.loadout.combination)}` : '公平模式 · 永久升级不带入局内'}</p>
          <div class="survival-center__actions"></div>
        </div>
        <div class="survival-center__best">
          <p class="survival-center__label">PERSONAL BEST</p>
          ${best ? `<strong class="survival-center__score">${score(best.score)}</strong><p>${bestMetrics(best)}</p><p>当前排名 · ${hub.leaderboard.currentRank ?? '暂无'}</p><p class="survival-center__loadout">${loadout(best.loadoutSummary)} · ${date(best.achievedAt)}</p>` : '<h2>尚无个人最佳</h2><p>完成一次正常战败结算后，成绩会进入朋友榜。</p><p>当前排名 · 暂无</p>'}
        </div>
      </section>
      <section class="survival-center__section" aria-labelledby="survival-rankings-title">
        <div class="survival-center__section-head"><div><p class="survival-center__label">FRIEND RANKING</p><h2 id="survival-rankings-title">朋友排行榜</h2></div><strong>我的排名 · ${hub.leaderboard.currentRank ?? '暂无'}</strong></div>
        <div class="survival-center__ranking"></div>
        <button class="survival-center__more survival-center__more--ranking" type="button">加载更多排名</button>
        <p class="survival-center__feedback survival-center__feedback--ranking"></p>
      </section>
      <section class="survival-center__section" aria-labelledby="survival-history-title">
        <div class="survival-center__section-head"><div><p class="survival-center__label">RUN ARCHIVE</p><h2 id="survival-history-title">我的运行记录</h2></div><span>仅显示正常战败</span></div>
        <div class="survival-center__history"><p>正在读取运行记录…</p></div>
        <button class="survival-center__more survival-center__more--history" type="button" hidden>加载更多记录</button>
        <p class="survival-center__feedback survival-center__feedback--history"></p>
      </section>
    </main>`;

  const actions = mount.querySelector<HTMLElement>('.survival-center__actions')!;
  mount.querySelector<HTMLElement>('.survival-center__identity')!.textContent = `${identity.displayName} · 邀请制朋友排行榜`;
  const primary = element('button', 'survival-center__primary', active ? '继续挑战' : '开始新运行');
  primary.type = 'button';
  if (active) primary.addEventListener('click', () => window.location.assign(`/arena/?survival=${encodeURIComponent(active.runId)}`));
  else if (progression.latestNssLoadout) primary.addEventListener('click', async () => {
    primary.disabled = true; primary.textContent = '正在创建检查点…';
    try { const result = await client.startRun({ requestId: crypto.randomUUID() }); window.location.assign(`/arena/?survival=${encodeURIComponent(result.run.runId)}`); }
    catch { primary.disabled = false; primary.textContent = '重试开始'; }
  });
  else primary.disabled = true;
  actions.append(primary);
  if (!active) { const customize = element('a', 'survival-center__secondary', '前往 NSS 定制器'); customize.href = '/customizer/'; actions.append(customize); }

  let rankingEntries = hub.leaderboard.entries;
  let rankingCursor = hub.leaderboard.nextCursor;
  let historyEntries: SurvivalHistoryEntry[] = [];
  let historyCursor: string | null = null;
  const rankingRoot = mount.querySelector<HTMLElement>('.survival-center__ranking')!;
  const historyRoot = mount.querySelector<HTMLElement>('.survival-center__history')!;
  const rankingMore = mount.querySelector<HTMLButtonElement>('.survival-center__more--ranking')!;
  const historyMore = mount.querySelector<HTMLButtonElement>('.survival-center__more--history')!;
  const rankingFeedback = mount.querySelector<HTMLElement>('.survival-center__feedback--ranking')!;
  const historyFeedback = mount.querySelector<HTMLElement>('.survival-center__feedback--history')!;

  const renderRanking = () => {
    rankingRoot.replaceChildren();
    if (!rankingEntries.length) rankingRoot.append(element('p', '', '朋友榜尚无成绩。'));
    for (const entry of rankingEntries) {
      const row = element('article', 'survival-center__rank');
      if (entry.playerId === identity.playerId) row.dataset.self = 'true';
      row.append(element('strong', 'survival-center__rank-number', `#${entry.rank}`), element('span', 'survival-center__rank-name', entry.displayName), element('strong', 'survival-center__rank-score', score(entry.score)), element('span', 'survival-center__rank-meta', `第 ${entry.highestCompletedWave} 波 · ${entry.bossesDefeated} BOSS · 风险 ${entry.riskLevel}`));
      rankingRoot.append(row);
    }
    rankingMore.hidden = rankingCursor === null;
  };
  const renderHistory = () => {
    historyRoot.replaceChildren();
    if (!historyEntries.length) historyRoot.append(element('p', '', '尚无正常战败的运行记录。'));
    for (const entry of historyEntries) {
      const row = element('article', 'survival-center__history-row');
      row.append(element('strong', 'survival-center__history-score', score(entry.score)), element('span', '', bestMetrics(entry)), element('span', 'survival-center__loadout', `${loadout(entry.loadoutSummary)} · ${date(entry.achievedAt)}`));
      historyRoot.append(row);
    }
    historyMore.hidden = historyCursor === null;
  };
  renderRanking();

  async function loadHistory() {
    historyMore.disabled = true; historyFeedback.textContent = '';
    try { const page = await client.getHistory({ limit: 20, ...(historyCursor ? { cursor: historyCursor } : {}) }); historyEntries = mergeSurvivalHistory(historyEntries, page.items); historyCursor = page.nextCursor; renderHistory(); }
    catch { historyFeedback.textContent = '运行记录加载失败，可重试。'; historyMore.hidden = false; }
    finally { historyMore.disabled = false; }
  }
  rankingMore.addEventListener('click', async () => {
    if (!rankingCursor) return;
    const cursor = rankingCursor; rankingMore.disabled = true; rankingFeedback.textContent = '';
    try { const page = await client.getLeaderboard({ limit: 20, cursor }); rankingEntries = mergeSurvivalLeaderboard(rankingEntries, page.entries); rankingCursor = page.nextCursor; renderRanking(); }
    catch { rankingFeedback.textContent = '排行榜加载失败，可重试。'; }
    finally { rankingMore.disabled = false; }
  });
  historyMore.addEventListener('click', () => { void loadHistory(); });
  await loadHistory();
}
