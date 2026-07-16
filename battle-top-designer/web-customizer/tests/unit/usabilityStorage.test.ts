// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { createUsabilitySession } from '../../src/usability/session';
import {
  clearUsabilitySession, loadUsabilitySession, saveUsabilitySession, usabilitySessionStorageKey,
} from '../../src/usability/storage';

describe('isolated usability session persistence', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips an in-progress session in its own namespace', () => {
    const session = createUsabilitySession({ sessionId: '3c1cd8b9-a283-4ddd-a236-59c8f3f7f440', startedAt: '2026-07-16T00:00:00.000Z' });
    expect(saveUsabilitySession(session)).toBe(true);
    expect(loadUsabilitySession()).toEqual({ status: 'ok', session });
    expect(localStorage.length).toBe(1);
    expect(localStorage.key(0)).toBe(usabilitySessionStorageKey);
  });

  it('restores an interrupted active task without advancing it', () => {
    const session = createUsabilitySession({ sessionId: '3c1cd8b9-a283-4ddd-a236-59c8f3f7f440', startedAt: '2026-07-16T00:00:00.000Z' });
    saveUsabilitySession(session);
    expect(loadUsabilitySession().session?.tasks[0].status).toBe('ACTIVE');
  });

  it('isolates malformed JSON as corrupt data', () => {
    localStorage.setItem(usabilitySessionStorageKey, '{broken');
    expect(loadUsabilitySession()).toEqual({ status: 'corrupt', session: null });
  });

  it('reports an incompatible schema without silently replacing it', () => {
    localStorage.setItem(usabilitySessionStorageKey, JSON.stringify({ schemaVersion: 'NSS-USABILITY-TEST-V0' }));
    expect(loadUsabilitySession()).toEqual({ status: 'version_mismatch', session: null });
  });

  it('reports read and write storage denial without throwing', () => {
    const deniedRead = { getItem: () => { throw new Error('denied'); } };
    const deniedWrite = { setItem: () => { throw new Error('denied'); } };
    expect(loadUsabilitySession(deniedRead)).toEqual({ status: 'denied', session: null });
    expect(saveUsabilitySession(createUsabilitySession(), deniedWrite)).toBe(false);
  });

  it('clears only the test-session key', () => {
    localStorage.setItem('nova-spin:phase3b:library:v1', 'keep');
    localStorage.setItem(usabilitySessionStorageKey, '{}');
    expect(clearUsabilitySession()).toBe(true);
    expect(localStorage.getItem(usabilitySessionStorageKey)).toBeNull();
    expect(localStorage.getItem('nova-spin:phase3b:library:v1')).toBe('keep');
  });

  it('does not create a replacement session after loading a completed record', () => {
    const session = { ...createUsabilitySession(), status: 'COMPLETED', completedAt: '2026-07-16T00:10:00.000Z' } as const;
    saveUsabilitySession(session);
    const restored = loadUsabilitySession();
    expect(restored.status).toBe('ok');
    expect(restored.session?.sessionId).toBe(session.sessionId);
    expect(restored.session?.status).toBe('COMPLETED');
  });
});
