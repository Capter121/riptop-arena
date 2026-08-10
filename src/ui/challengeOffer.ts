import type { ChallengeClient, ChallengeOfferView } from '../challenges/challengeClient';
import type { LocalIdentity } from '../auth/localIdentity';

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function creatorFrom(view: ChallengeOfferView) {
  const creator = view.offer.creator;
  return creator && typeof creator === 'object' && !Array.isArray(creator)
    ? creator as Record<string, unknown>
    : {};
}

export function offerViewerRole(view: ChallengeOfferView, playerId: string) {
  return creatorFrom(view).playerId === playerId ? 'creator' : 'responder';
}

export async function loadChallengeOffer(client: Pick<ChallengeClient, 'getOffer'>, offerId: string) {
  return { view: await client.getOffer(offerId) };
}

function statusLabel(status: ChallengeOfferView['status']) {
  return { open: '等待认领', claimed: '已被认领', revoked: '邀请已撤销', expired: '邀请已过期' }[status];
}

async function copyLink(input: HTMLInputElement, status: HTMLElement) {
  try {
    await navigator.clipboard.writeText(input.value);
    status.textContent = '邀请链接已复制';
  } catch {
    input.focus();
    input.select();
    status.textContent = '无法自动复制，请手动复制上方链接';
  }
}

export async function renderChallengeOffer(
  mount: HTMLElement,
  identity: LocalIdentity,
  client: ChallengeClient,
  offerId: string,
) {
  mount.replaceChildren(element('main', 'portal-state', '正在读取挑战邀请…'));
  try {
    const { view } = await loadChallengeOffer(client, offerId);
    const shell = element('main', 'challenge-page');
    const back = element('a', 'challenge-back', '← 返回挑战中心');
    back.href = '/challenges/';
    const eyebrow = element('p', 'portal-eyebrow', 'GHOST CHALLENGE');
    const title = element('h1', undefined, '装配幽灵挑战');
    const state = element('p', `challenge-status challenge-status--${view.status}`, statusLabel(view.status));
    const creator = creatorFrom(view);
    const intel = element('section', 'challenge-intel');
    const name = element('strong', undefined, typeof creator.displayName === 'string' ? creator.displayName : '未知玩家');
    const mode = element('span', undefined, view.offer.mode === 'full_power' ? '全力模式' : '公平模式');
    const arena = element('span', undefined, typeof view.offer.arena === 'string' ? view.offer.arena : '未知竞技场');
    const message = element('p', 'challenge-message', typeof view.offer.message === 'string' && view.offer.message ? view.offer.message : '未留下挑战留言');
    intel.append(name, mode, arena, message);
    const actions = element('section', 'challenge-actions');
    const feedback = element('p', 'challenge-feedback');

    if (offerViewerRole(view, identity.playerId) === 'creator') {
      const share = element('input', 'challenge-share') as HTMLInputElement;
      share.readOnly = true;
      share.value = `${window.location.origin}/challenge/${view.id}`;
      share.setAttribute('aria-label', '邀请链接');
      const copy = element('button', 'challenge-primary', '复制邀请链接');
      copy.type = 'button';
      copy.addEventListener('click', () => { void copyLink(share, feedback); });
      actions.append(share, copy);
      if (view.actions.canRevoke) {
        const revoke = element('button', 'challenge-secondary', '撤销邀请');
        revoke.type = 'button';
        revoke.addEventListener('click', async () => {
          revoke.disabled = true;
          try { await client.revokeOffer(view.id); await renderChallengeOffer(mount, identity, client, offerId); }
          catch { feedback.textContent = '撤销失败，请稍后重试'; revoke.disabled = false; }
        });
        actions.append(revoke);
      }
    } else if (view.actions.canClaim) {
      const adjust = element('a', 'challenge-secondary', '调整我的装配');
      adjust.href = '/customizer/';
      const claim = element('button', 'challenge-primary', '认领并应战');
      claim.type = 'button';
      claim.addEventListener('click', async () => {
        claim.disabled = true;
        feedback.textContent = '正在冻结双方装配…';
        try {
          const challenge = await client.claimOffer(view.id);
          window.location.assign(`/arena/?challenge=${challenge.id}`);
        } catch {
          feedback.textContent = '认领失败：邀请可能已过期、被撤销或已被朋友认领';
          claim.disabled = false;
        }
      });
      actions.append(adjust, claim);
    } else {
      feedback.textContent = view.status === 'claimed'
        ? '这条邀请已经绑定到一场正式挑战。'
        : '这条邀请当前不可操作。';
    }
    actions.append(feedback);
    shell.append(back, eyebrow, title, state, intel, actions);
    mount.replaceChildren(shell);
  } catch {
    const state = element('main', 'portal-state');
    state.append(element('h1', undefined, '无法打开挑战邀请'), element('p', undefined, '邀请不存在、无权查看、版本不支持或网络已断开。'));
    const retry = element('button', undefined, '重试');
    retry.type = 'button';
    retry.addEventListener('click', () => { void renderChallengeOffer(mount, identity, client, offerId); });
    state.append(retry);
    mount.replaceChildren(state);
  }
}
