import type { ProductErrorCode, ShareMethod } from './session';

export const usabilityActionEvent = 'nova-spin:usability-action';

export type UsabilityAction =
  | { type: 'PART_SELECTED'; partId: string; combinationId: string }
  | { type: 'FAVORITE_SAVED'; combinationId: string }
  | { type: 'FAVORITE_RESTORED'; combinationId: string }
  | { type: 'SHARE_SUCCEEDED'; method: ShareMethod }
  | { type: 'SYSTEM_ERROR'; code: ProductErrorCode };

export function emitUsabilityAction(action: UsabilityAction) {
  window.dispatchEvent(new CustomEvent<UsabilityAction>(usabilityActionEvent, { detail: action }));
}
