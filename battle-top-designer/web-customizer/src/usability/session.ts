import { partById, type CameraPreset, type Family } from '../domain';

export const USABILITY_SCHEMA_VERSION = 'NSS-USABILITY-TEST-V1' as const;
export const USABILITY_TASK_IDS = [
  'attack-combination', 'assist-comparison', 'gear-comparison',
  'tip-comparison', 'favorite-restore', 'share-or-export',
] as const;
export const PRODUCT_ERROR_CODES = [
  'GLB_LOAD_FAILED', 'INVALID_BUILD', 'TASK_SKIPPED', 'SHARE_FAILED',
  'STORAGE_FAILED', 'FOCUS_READOUT_MISSING', 'USER_CANCELLED',
] as const;

export type UsabilityTaskId = (typeof USABILITY_TASK_IDS)[number];
export type ProductErrorCode = (typeof PRODUCT_ERROR_CODES)[number];
export type UsabilitySessionStatus = 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
export type UsabilityTaskStatus = 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'SKIPPED';
export type AssistFeedback = 'ALL_EASY' | 'TWO_CONFUSING' | 'ALL_DIFFICULT' | 'UNSURE';
export type ShareMethod = 'link' | 'qr' | 'png';

export interface UsabilityTaskResult {
  id: UsabilityTaskId;
  status: UsabilityTaskStatus;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  combinationId: string | null;
  selectedPartIds: string[];
  readyPartIds: string[];
  focusReadoutPartIds: string[];
  viewedPartIds: string[];
  viewOrder: string[];
  finalSelection: string | null;
  assistFeedback: AssistFeedback | null;
  favoriteSavedIds: string[];
  favoriteRestoredIds: string[];
  completionMethod: ShareMethod | null;
  errorCodes: ProductErrorCode[];
}

export interface UsabilitySession {
  schemaVersion: typeof USABILITY_SCHEMA_VERSION;
  sessionId: string;
  startedAt: string;
  completedAt: string | null;
  status: UsabilitySessionStatus;
  tasks: UsabilityTaskResult[];
  finalCombinationId: string | null;
  selectedPartIds: string[];
  errors: ProductErrorCode[];
  governance: {
    humanVisualReview: 'PENDING';
    baseline: 'PROVISIONAL_NOT_FINAL';
  };
}

export type UsabilityEvent =
  | { type: 'PART_SELECTED'; partId: string; combinationId: string }
  | { type: 'PART_READY'; partId: string; family: Family; cameraPreset: CameraPreset; combinationId: string }
  | { type: 'FOCUS_READOUT_VISIBLE'; partId: string; target: 'assist' | 'gear' | 'tip' }
  | { type: 'SET_ASSIST_FEEDBACK'; value: AssistFeedback }
  | { type: 'FAVORITE_SAVED'; combinationId: string }
  | { type: 'FAVORITE_RESTORED'; combinationId: string }
  | { type: 'SHARE_SUCCEEDED'; method: ShareMethod }
  | { type: 'SYSTEM_ERROR'; code: ProductErrorCode }
  | { type: 'COMPLETE_TASK'; combinationId: string; selectedPartId?: string }
  | { type: 'SKIP_TASK'; combinationId: string }
  | { type: 'ABANDON_SESSION'; combinationId: string };

const requiredParts: Partial<Record<UsabilityTaskId, readonly string[]>> = {
  'assist-comparison': ['assist_heavy', 'assist_guard', 'assist_air'],
  'gear-comparison': ['gear_low', 'gear_medium', 'gear_high'],
  'tip-comparison': ['tip_flat_attack', 'tip_ball_defense', 'tip_needle_stamina', 'tip_taper_balance'],
};
const expectedPresentation: Partial<Record<Family, CameraPreset>> = { assist: 'perspective', gear: 'side', tip: 'bottom' };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const blankTask = (id: UsabilityTaskId, active: boolean, startedAt: string): UsabilityTaskResult => ({
  id,
  status: active ? 'ACTIVE' : 'PENDING',
  startedAt: active ? startedAt : null,
  completedAt: null,
  durationMs: null,
  combinationId: null,
  selectedPartIds: [],
  readyPartIds: [],
  focusReadoutPartIds: [],
  viewedPartIds: [],
  viewOrder: [],
  finalSelection: null,
  assistFeedback: null,
  favoriteSavedIds: [],
  favoriteRestoredIds: [],
  completionMethod: null,
  errorCodes: [],
});

const uniqueCapped = (values: string[], value: string, limit = 16) =>
  values.includes(value) ? values : [...values, value].slice(-limit);
const appendCapped = <T>(values: T[], value: T, limit: number) => [...values, value].slice(-limit);
const duration = (startedAt: string | null, completedAt: string) =>
  startedAt ? Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)) : 0;
const isProductError = (value: unknown): value is ProductErrorCode =>
  PRODUCT_ERROR_CODES.includes(value as ProductErrorCode);

export function createUsabilitySession(options: { sessionId?: string; startedAt?: string } = {}): UsabilitySession {
  const startedAt = options.startedAt ?? new Date().toISOString();
  const sessionId = options.sessionId ?? crypto.randomUUID();
  if (!uuidPattern.test(sessionId)) throw new Error('Anonymous sessionId must be a UUID v4');
  return {
    schemaVersion: USABILITY_SCHEMA_VERSION,
    sessionId,
    startedAt,
    completedAt: null,
    status: 'IN_PROGRESS',
    tasks: USABILITY_TASK_IDS.map((id, index) => blankTask(id, index === 0, startedAt)),
    finalCombinationId: null,
    selectedPartIds: [],
    errors: [],
    governance: { humanVisualReview: 'PENDING', baseline: 'PROVISIONAL_NOT_FINAL' },
  };
}

export function currentUsabilityTask(session: UsabilitySession): UsabilityTaskResult | null {
  return session.tasks.find(task => task.status === 'ACTIVE') ?? null;
}

export function taskById(session: UsabilitySession, id: UsabilityTaskId): UsabilityTaskResult {
  return session.tasks.find(task => task.id === id)!;
}

const containsAll = (actual: string[], expected: readonly string[]) => expected.every(value => actual.includes(value));

export function canCompleteCurrentTask(session: UsabilitySession): boolean {
  const task = currentUsabilityTask(session);
  if (!task || session.status !== 'IN_PROGRESS') return false;
  if (task.id === 'attack-combination') return task.selectedPartIds.length > 0 && task.readyPartIds.length > 0;
  if (task.id === 'assist-comparison') return containsAll(task.viewedPartIds, requiredParts[task.id]!) && task.assistFeedback !== null;
  if (task.id === 'gear-comparison' || task.id === 'tip-comparison') return containsAll(task.viewedPartIds, requiredParts[task.id]!);
  if (task.id === 'favorite-restore') return task.favoriteSavedIds.some(id => task.favoriteRestoredIds.includes(id));
  return task.completionMethod !== null;
}

const syncViewed = (task: UsabilityTaskResult, partId: string) => {
  if (!task.readyPartIds.includes(partId) || !task.focusReadoutPartIds.includes(partId) || task.viewedPartIds.includes(partId)) return;
  task.viewedPartIds = uniqueCapped(task.viewedPartIds, partId, 4);
  task.viewOrder = uniqueCapped(task.viewOrder, partId, 4);
};

const activateNext = (session: UsabilitySession, currentIndex: number, at: string) => {
  const next = session.tasks[currentIndex + 1];
  if (next) {
    next.status = 'ACTIVE';
    next.startedAt = at;
  } else {
    session.status = 'COMPLETED';
    session.completedAt = at;
  }
};

export function applyUsabilityEvent(session: UsabilitySession, event: UsabilityEvent, at = new Date().toISOString()): UsabilitySession {
  if (session.status !== 'IN_PROGRESS') return session;
  const next = structuredClone(session);
  const task = currentUsabilityTask(next);
  if (!task) return session;
  const taskIndex = next.tasks.findIndex(item => item.id === task.id);

  if ('combinationId' in event) next.finalCombinationId = event.combinationId;
  if (event.type === 'PART_SELECTED') {
    if (!partById.has(event.partId)) return session;
    task.selectedPartIds = uniqueCapped(task.selectedPartIds, event.partId);
    next.selectedPartIds = uniqueCapped(next.selectedPartIds, event.partId);
  } else if (event.type === 'PART_READY') {
    const part = partById.get(event.partId);
    if (!part || part.family !== event.family || !task.selectedPartIds.includes(event.partId)) return session;
    const expected = requiredParts[task.id];
    const presentationMatches = task.id === 'attack-combination' || expectedPresentation[event.family] === event.cameraPreset;
    if (presentationMatches && (!expected || expected.includes(event.partId))) {
      task.readyPartIds = uniqueCapped(task.readyPartIds, event.partId);
      syncViewed(task, event.partId);
    }
  } else if (event.type === 'FOCUS_READOUT_VISIBLE') {
    const part = partById.get(event.partId);
    if (part?.family !== event.target || !requiredParts[task.id]?.includes(event.partId)) return session;
    task.focusReadoutPartIds = uniqueCapped(task.focusReadoutPartIds, event.partId, 4);
    syncViewed(task, event.partId);
  } else if (event.type === 'SET_ASSIST_FEEDBACK') {
    if (task.id !== 'assist-comparison') return session;
    task.assistFeedback = event.value;
  } else if (event.type === 'FAVORITE_SAVED') {
    if (task.id !== 'favorite-restore') return session;
    task.favoriteSavedIds = uniqueCapped(task.favoriteSavedIds, event.combinationId, 8);
  } else if (event.type === 'FAVORITE_RESTORED') {
    if (task.id !== 'favorite-restore') return session;
    task.favoriteRestoredIds = uniqueCapped(task.favoriteRestoredIds, event.combinationId, 8);
  } else if (event.type === 'SHARE_SUCCEEDED') {
    if (task.id !== 'share-or-export') return session;
    task.completionMethod = event.method;
  } else if (event.type === 'SYSTEM_ERROR') {
    if (!isProductError(event.code)) return session;
    next.errors = appendCapped(next.errors, event.code, 50);
    task.errorCodes = appendCapped(task.errorCodes, event.code, 20);
  } else if (event.type === 'SKIP_TASK') {
    task.status = 'SKIPPED';
    task.completedAt = at;
    task.durationMs = duration(task.startedAt, at);
    task.combinationId = event.combinationId;
    task.errorCodes = appendCapped(task.errorCodes, 'TASK_SKIPPED', 20);
    next.errors = appendCapped(next.errors, 'TASK_SKIPPED', 50);
    activateNext(next, taskIndex, at);
  } else if (event.type === 'ABANDON_SESSION') {
    next.status = 'ABANDONED';
    next.completedAt = at;
    next.errors = appendCapped(next.errors, 'USER_CANCELLED', 50);
    task.errorCodes = appendCapped(task.errorCodes, 'USER_CANCELLED', 20);
  } else if (event.type === 'COMPLETE_TASK') {
    if (!canCompleteCurrentTask(next)) return session;
    const expected = requiredParts[task.id];
    if (expected && (!event.selectedPartId || !expected.includes(event.selectedPartId))) return session;
    task.status = 'COMPLETED';
    task.completedAt = at;
    task.durationMs = duration(task.startedAt, at);
    task.combinationId = event.combinationId;
    task.finalSelection = event.selectedPartId ?? null;
    activateNext(next, taskIndex, at);
  }
  return next;
}

export function isUsabilitySession(value: unknown): value is UsabilitySession {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const session = value as Partial<UsabilitySession>;
  if (session.schemaVersion !== USABILITY_SCHEMA_VERSION || typeof session.sessionId !== 'string' || !uuidPattern.test(session.sessionId)) return false;
  if (typeof session.startedAt !== 'string' || !['IN_PROGRESS', 'COMPLETED', 'ABANDONED'].includes(session.status ?? '')) return false;
  if (!Array.isArray(session.tasks) || session.tasks.length !== USABILITY_TASK_IDS.length) return false;
  if (!USABILITY_TASK_IDS.every((id, index) => session.tasks?.[index]?.id === id)) return false;
  if (!Array.isArray(session.selectedPartIds) || session.selectedPartIds.length > 16 || !Array.isArray(session.errors) || session.errors.length > 50) return false;
  if (!session.errors.every(isProductError)) return false;
  return session.tasks.every(task =>
    ['PENDING', 'ACTIVE', 'COMPLETED', 'SKIPPED'].includes(task.status)
    && Array.isArray(task.selectedPartIds) && Array.isArray(task.readyPartIds)
    && Array.isArray(task.focusReadoutPartIds) && Array.isArray(task.viewedPartIds)
    && Array.isArray(task.viewOrder) && Array.isArray(task.favoriteSavedIds)
    && Array.isArray(task.favoriteRestoredIds) && Array.isArray(task.errorCodes)
    && task.errorCodes.every(isProductError));
}
