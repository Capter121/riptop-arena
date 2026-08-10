import type { ProgressionState } from '../app/progression';
import type { LocalIdentity } from '../auth/localIdentity';
import type { ChallengeClient, ChallengeListItem } from '../challenges/challengeClient';
import { createPendingRetrySession, retryPendingResultsOnce } from '../challenges/pendingChallengeResult';

export const DEFAULT_CHALLENGE_DRAFT = Object.freeze({ mode: 'fair' as const, arena: 'classic_grid' as const, message: '' });
const retrySession = createPendingRetrySession();

export function canCreateChallenge(value: Pick<ProgressionState, 'latestNssLoadout'> | { latestNssLoadout: unknown }) {
  return value.latestNssLoadout !== null;
}

export function loadChallengeGroup(client: Pick<ChallengeClient, 'listChallenges'>, group: 'waiting_me' | 'waiting_friend' | 'history', cursor?: string) {
  return client.listChallenges({ group, ...(cursor ? { cursor } : {}), limit: 20 });
}

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const value = document.createElement(tag);
  if (className) value.className = className;
  if (text !== undefined) value.textContent = text;
  return value;
}

function itemTitle(item: ChallengeListItem) {
  const source = item.kind === 'offer' ? item.offer.creator : item.input.enemy;
  const participant = source && typeof source === 'object' && !Array.isArray(source)
    ? source as Record<string, unknown> : null;
  return typeof participant?.displayName === 'string' ? participant.displayName : '好友挑战';
}

function renderItem(item: ChallengeListItem, client: ChallengeClient, refresh: () => void) {
  const entry = node('article', 'challenge-list-item');
  entry.append(node('strong', undefined, itemTitle(item)), node('span', undefined, item.status));
  const actions = node('div', 'challenge-list-actions');
  const notice = node('span', 'challenge-item-notice');
  if (item.kind === 'offer') {
    const open = node('a', 'challenge-small-action', '查看'); open.href = `/challenge/${item.id}`; actions.append(open);
    if (item.actions.canRevoke) {
      const revoke = node('button', 'challenge-small-action', '撤销'); revoke.type = 'button';
      revoke.addEventListener('click', async () => {
        revoke.disabled = true;
        try { await client.revokeOffer(item.id); refresh(); }
        catch { notice.textContent = '撤销失败'; revoke.disabled = false; }
      }); actions.append(revoke);
    }
  } else {
    const open = node('a', 'challenge-small-action', item.actions.canBattle ? '进入应战' : '查看战报');
    open.href = item.actions.canBattle ? `/arena/?challenge=${item.id}` : `/challenges/?report=${item.id}`;
    actions.append(open);
    if (item.actions.canRematch) {
      const rematch = node('button', 'challenge-small-action', '发起回挑战'); rematch.type = 'button';
      rematch.addEventListener('click', async () => {
        rematch.disabled = true;
        try { const offer = await client.createRematch(item.id); window.location.assign(`/challenge/${offer.id}`); }
        catch { notice.textContent = '回挑战创建失败'; rematch.disabled = false; }
      });
      actions.append(rematch);
    }
  }
  entry.append(actions, notice);
  return entry;
}

export async function renderChallengeCenter(
  mount: HTMLElement,
  identity: LocalIdentity,
  progression: ProgressionState,
  client: ChallengeClient,
) {
  const shell = node('main', 'challenge-page challenge-center');
  const back = node('a', 'challenge-back', '← 返回竞技据点'); back.href = '/';
  const pendingBadge = node('p', 'challenge-pending-count', '待处理挑战：读取中');
  shell.append(back, node('p', 'portal-eyebrow', 'ASYNC GHOST ARENA'), node('h1', undefined, '好友挑战中心'), pendingBadge);
  const createPanel = node('section', 'challenge-create');
  createPanel.append(node('h2', undefined, '创建装配幽灵邀请'));
  const form = node('form', 'challenge-create-form');
  const mode = node('select') as HTMLSelectElement; mode.setAttribute('aria-label', '挑战模式');
  for (const [value, label] of [['fair', '公平模式'], ['full_power', '全力模式']]) { const option = node('option', undefined, label) as HTMLOptionElement; option.value = value; mode.append(option); }
  const arena = node('select') as HTMLSelectElement; arena.setAttribute('aria-label', '竞技场');
  for (const value of ['classic_grid', 'neon_magma', 'absolute_zero']) { const option = node('option', undefined, value) as HTMLOptionElement; option.value = value; arena.append(option); }
  const message = node('input') as HTMLInputElement; message.maxLength = 120; message.placeholder = '挑战留言（最多 120 字）'; message.setAttribute('aria-label', '挑战留言');
  const submit = node('button', 'challenge-primary', '生成邀请链接'); submit.type = 'submit'; submit.disabled = !canCreateChallenge(progression);
  const feedback = node('p', 'challenge-feedback');
  form.append(mode, arena, message, submit);
  if (!canCreateChallenge(progression)) { feedback.textContent = '需要先完成并同步 NSS 五件装配。'; const customize = node('a', 'challenge-secondary', '前往 NSS 定制器'); customize.href = '/customizer/'; createPanel.append(form, feedback, customize); }
  else createPanel.append(form, feedback);
  form.addEventListener('submit', async event => {
    event.preventDefault(); submit.disabled = true; feedback.textContent = '正在冻结当前装配…';
    try {
      const offer = await client.createOffer({ requestId: crypto.randomUUID(), mode: mode.value as 'fair' | 'full_power', arena: arena.value as 'classic_grid', message: message.value });
      window.location.assign(`/challenge/${offer.id}`);
    } catch { feedback.textContent = '创建失败，请检查网络或重新同步装配。'; submit.disabled = false; }
  });
  shell.append(createPanel);
  const groups = node('section', 'challenge-groups');
  shell.append(groups); mount.replaceChildren(shell);

  await retryPendingResultsOnce(identity.playerId, (id, envelope) => client.submitResult(id, envelope), { session: retrySession });
  for (const [group, title] of [['waiting_me', '等待我'], ['waiting_friend', '等待朋友'], ['history', '历史战报']] as const) {
    const panel = node('section', 'challenge-group'); panel.append(node('h2', undefined, title));
    const list = node('div', 'challenge-list'); panel.append(list); groups.append(panel);
    let cursor: string | undefined;
    const load = async (append = false) => {
      if (!append) list.replaceChildren(node('p', 'challenge-feedback', '正在读取…'));
      try {
        const page = await loadChallengeGroup(client, group, cursor);
        pendingBadge.textContent = `待处理挑战：${page.pendingCount}`;
        if (!append) list.replaceChildren();
        for (const item of page.items) list.append(renderItem(item, client, () => { cursor = undefined; void load(); }));
        cursor = page.nextCursor ?? undefined;
        panel.querySelector('.challenge-load-more')?.remove();
        if (cursor) { const more = node('button', 'challenge-load-more', '加载更多'); more.type = 'button'; more.addEventListener('click', () => { void load(true); }); panel.append(more); }
        if (!list.children.length) list.append(node('p', 'challenge-feedback', '暂无项目'));
      } catch { list.replaceChildren(node('p', 'challenge-feedback', '读取失败，请刷新重试')); }
    };
    void load();
  }
}
