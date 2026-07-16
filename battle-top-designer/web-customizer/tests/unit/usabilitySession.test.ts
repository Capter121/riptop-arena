import { describe, expect, it } from 'vitest';
import {
  applyUsabilityEvent, canCompleteCurrentTask, createUsabilitySession, currentUsabilityTask,
  taskById, USABILITY_TASK_IDS,
} from '../../src/usability/session';

const at = (minute: number) => `2026-07-16T00:${String(minute).padStart(2, '0')}:00.000Z`;
const fresh = () => createUsabilitySession({ sessionId: '3c1cd8b9-a283-4ddd-a236-59c8f3f7f440', startedAt: at(0) });
const apply = (session: ReturnType<typeof fresh>, event: Parameters<typeof applyUsabilityEvent>[1], minute = 1) =>
  applyUsabilityEvent(session, event, at(minute));
const skipTo = (target: string) => {
  let session = fresh();
  let minute = 1;
  while (currentUsabilityTask(session)?.id !== target) session = apply(session, { type: 'SKIP_TASK', combinationId: 'nss-p2c-0138' }, minute++);
  return session;
};
const viewPart = (session: ReturnType<typeof fresh>, partId: string, family: 'assist' | 'gear' | 'tip', cameraPreset: 'perspective' | 'side' | 'bottom', minute: number) => {
  let next = apply(session, { type: 'PART_SELECTED', partId, combinationId: 'nss-p2c-0138' }, minute);
  next = apply(next, { type: 'PART_READY', partId, family, cameraPreset, combinationId: 'nss-p2c-0138' }, minute);
  return apply(next, { type: 'FOCUS_READOUT_VISIBLE', partId, target: family }, minute);
};

describe('anonymous usability session state machine', () => {
  it('creates an anonymous versioned session', () => {
    const session = createUsabilitySession();
    expect(session.schemaVersion).toBe('NSS-USABILITY-TEST-V1');
    expect(session.sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(session.status).toBe('IN_PROGRESS');
  });

  it('does not derive the session ID from personal or machine data', () => {
    const session = createUsabilitySession();
    expect(session.sessionId).not.toMatch(/Terla|2026|battle|\\|\//i);
    expect(Object.keys(session)).not.toContain('name');
  });

  it('creates exactly six ordered tasks with only the first active', () => {
    const session = fresh();
    expect(session.tasks.map(task => task.id)).toEqual(USABILITY_TASK_IDS);
    expect(session.tasks.map(task => task.status)).toEqual(['ACTIVE', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING']);
  });

  it('never completes a task from selection, readiness, focus, or elapsed time alone', () => {
    let session = fresh();
    session = apply(session, { type: 'PART_SELECTED', partId: 'blade_dual_comet', combinationId: 'nss-p2c-0042' }, 1);
    session = apply(session, { type: 'PART_READY', partId: 'blade_dual_comet', family: 'blade', cameraPreset: 'perspective', combinationId: 'nss-p2c-0042' }, 59);
    expect(currentUsabilityTask(session)?.status).toBe('ACTIVE');
    expect(session.status).toBe('IN_PROGRESS');
  });

  it('requires a real loaded selection before Task 1 can complete', () => {
    let session = fresh();
    session = apply(session, { type: 'PART_SELECTED', partId: 'blade_dual_comet', combinationId: 'nss-p2c-0042' });
    expect(canCompleteCurrentTask(session)).toBe(false);
    session = apply(session, { type: 'PART_READY', partId: 'blade_dual_comet', family: 'blade', cameraPreset: 'perspective', combinationId: 'nss-p2c-0042' });
    expect(canCompleteCurrentTask(session)).toBe(true);
    session = apply(session, { type: 'COMPLETE_TASK', combinationId: 'nss-p2c-0042' }, 2);
    expect(taskById(session, 'attack-combination')).toMatchObject({ status: 'COMPLETED', combinationId: 'nss-p2c-0042', durationMs: 120000 });
  });

  it('does not complete Assist comparison until all three are ready and focused', () => {
    let session = skipTo('assist-comparison');
    session = viewPart(session, 'assist_heavy', 'assist', 'perspective', 2);
    session = viewPart(session, 'assist_guard', 'assist', 'perspective', 3);
    session = apply(session, { type: 'SET_ASSIST_FEEDBACK', value: 'TWO_CONFUSING' }, 3);
    expect(canCompleteCurrentTask(session)).toBe(false);
    expect(taskById(session, 'assist-comparison').viewedPartIds).toEqual(['assist_heavy', 'assist_guard']);
  });

  it('records Assist view order, readout success, feedback, and final choice', () => {
    let session = skipTo('assist-comparison');
    for (const [index, id] of ['assist_guard', 'assist_air', 'assist_heavy'].entries()) session = viewPart(session, id, 'assist', 'perspective', index + 2);
    session = apply(session, { type: 'SET_ASSIST_FEEDBACK', value: 'ALL_EASY' }, 5);
    expect(canCompleteCurrentTask(session)).toBe(true);
    session = apply(session, { type: 'COMPLETE_TASK', combinationId: 'nss-p2c-0138', selectedPartId: 'assist_heavy' }, 6);
    expect(taskById(session, 'assist-comparison')).toMatchObject({
      status: 'COMPLETED', viewOrder: ['assist_guard', 'assist_air', 'assist_heavy'],
      focusReadoutPartIds: ['assist_guard', 'assist_air', 'assist_heavy'], assistFeedback: 'ALL_EASY', finalSelection: 'assist_heavy',
    });
  });

  it('rejects Assist readiness with the wrong camera compensation', () => {
    let session = skipTo('assist-comparison');
    session = apply(session, { type: 'PART_READY', partId: 'assist_heavy', family: 'assist', cameraPreset: 'side', combinationId: 'nss-p2c-0138' });
    session = apply(session, { type: 'FOCUS_READOUT_VISIBLE', partId: 'assist_heavy', target: 'assist' });
    expect(taskById(session, 'assist-comparison').viewedPartIds).toEqual([]);
  });

  it('requires Low, Medium, and High with side focus for Task 3', () => {
    let session = skipTo('gear-comparison');
    session = viewPart(session, 'gear_low', 'gear', 'side', 3);
    session = viewPart(session, 'gear_medium', 'gear', 'side', 4);
    expect(canCompleteCurrentTask(session)).toBe(false);
    session = viewPart(session, 'gear_high', 'gear', 'side', 5);
    expect(canCompleteCurrentTask(session)).toBe(true);
  });

  it('does not count a Gear that never displayed its readout', () => {
    let session = skipTo('gear-comparison');
    session = apply(session, { type: 'PART_READY', partId: 'gear_low', family: 'gear', cameraPreset: 'side', combinationId: 'nss-p2c-0138' });
    expect(taskById(session, 'gear-comparison').viewedPartIds).toEqual([]);
  });

  it('requires all four Tip shapes with bottom focus for Task 4', () => {
    let session = skipTo('tip-comparison');
    for (const [index, id] of ['tip_flat_attack', 'tip_ball_defense', 'tip_needle_stamina'].entries()) session = viewPart(session, id, 'tip', 'bottom', index + 4);
    expect(canCompleteCurrentTask(session)).toBe(false);
    session = viewPart(session, 'tip_taper_balance', 'tip', 'bottom', 8);
    expect(canCompleteCurrentTask(session)).toBe(true);
  });

  it('requires the same favorite to be saved and restored for Task 5', () => {
    let session = skipTo('favorite-restore');
    session = apply(session, { type: 'FAVORITE_SAVED', combinationId: 'nss-p2c-0042' }, 5);
    session = apply(session, { type: 'FAVORITE_RESTORED', combinationId: 'nss-p2c-0138' }, 6);
    expect(canCompleteCurrentTask(session)).toBe(false);
    session = apply(session, { type: 'FAVORITE_RESTORED', combinationId: 'nss-p2c-0042' }, 7);
    expect(canCompleteCurrentTask(session)).toBe(true);
  });

  it.each(['link', 'qr', 'png'] as const)('accepts a real successful %s action for Task 6', method => {
    let session = skipTo('share-or-export');
    session = apply(session, { type: 'SHARE_SUCCEEDED', method }, 6);
    expect(canCompleteCurrentTask(session)).toBe(true);
    expect(taskById(session, 'share-or-export').completionMethod).toBe(method);
  });

  it('skips only the active task and records TASK_SKIPPED', () => {
    const session = apply(fresh(), { type: 'SKIP_TASK', combinationId: 'nss-p2c-0138' });
    expect(taskById(session, 'attack-combination')).toMatchObject({ status: 'SKIPPED', errorCodes: ['TASK_SKIPPED'] });
    expect(currentUsabilityTask(session)?.id).toBe('assist-comparison');
  });

  it('marks a session completed only after every task is terminal', () => {
    let session = fresh();
    for (let index = 0; index < 6; index += 1) session = apply(session, { type: 'SKIP_TASK', combinationId: 'nss-p2c-0138' }, index + 1);
    expect(session.status).toBe('COMPLETED');
    expect(session.completedAt).toBe(at(6));
  });

  it('marks an unfinished session abandoned only from an explicit user action', () => {
    const session = apply(fresh(), { type: 'ABANDON_SESSION', combinationId: 'nss-p2c-0138' });
    expect(session).toMatchObject({ status: 'ABANDONED', completedAt: at(1), finalCombinationId: 'nss-p2c-0138' });
    expect(session.errors).toEqual(['USER_CANCELLED']);
  });

  it('caps product errors and rejects unknown codes', () => {
    let session = fresh();
    for (let index = 0; index < 60; index += 1) session = apply(session, { type: 'SYSTEM_ERROR', code: 'GLB_LOAD_FAILED' });
    session = applyUsabilityEvent(session, { type: 'SYSTEM_ERROR', code: 'UNKNOWN' as never }, at(2));
    expect(session.errors).toHaveLength(50);
    expect(new Set(session.errors)).toEqual(new Set(['GLB_LOAD_FAILED']));
  });
});
