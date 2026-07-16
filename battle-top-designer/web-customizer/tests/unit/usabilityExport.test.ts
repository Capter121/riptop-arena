import { describe, expect, it, vi } from 'vitest';
import { applyUsabilityEvent, createUsabilitySession } from '../../src/usability/session';
import {
  createUsabilityExport, findForbiddenExportFields, serializeUsabilityExport,
} from '../../src/usability/export';

const session = () => {
  let value = createUsabilitySession({ sessionId: '3c1cd8b9-a283-4ddd-a236-59c8f3f7f440', startedAt: '2026-07-16T00:00:00.000Z' });
  value = applyUsabilityEvent(value, { type: 'PART_SELECTED', partId: 'blade_dual_comet', combinationId: 'nss-p2c-0042' }, '2026-07-16T00:01:00.000Z');
  return value;
};

describe('whitelisted anonymous usability export', () => {
  it('contains only the approved top-level fields', () => {
    expect(Object.keys(createUsabilityExport(session()))).toEqual([
      'schemaVersion', 'sessionId', 'startedAt', 'completedAt', 'status', 'tasks',
      'finalCombinationId', 'selectedPartIds', 'errors', 'governance',
    ]);
  });

  it('detects forbidden personal, fingerprint, path, and free-text fields', () => {
    expect(findForbiddenExportFields({ email: 'person@example.com', userAgent: 'Browser', stack: 'C:\\secret', notes: 'free text' })).toEqual([
      'email', 'userAgent', 'stack', 'notes',
    ]);
  });

  it('round-trips valid JSON without adding fields', () => {
    const exported = createUsabilityExport(session());
    expect(JSON.parse(serializeUsabilityExport(session()))).toEqual(exported);
  });

  it('does not export nickname or other personal fields', () => {
    const text = serializeUsabilityExport(session());
    expect(text).not.toMatch(/"(?:nickname|name|email|phone|address|ip|userAgent|geolocation)"\s*:/i);
    expect(findForbiddenExportFields(JSON.parse(text))).toEqual([]);
  });

  it('exports only whitelisted product error codes without stack traces', () => {
    const withError = applyUsabilityEvent(session(), { type: 'SYSTEM_ERROR', code: 'GLB_LOAD_FAILED' }, '2026-07-16T00:02:00.000Z');
    const exported = createUsabilityExport(withError);
    expect(exported.errors).toEqual(['GLB_LOAD_FAILED']);
    expect(JSON.stringify(exported)).not.toMatch(/stack|file:\/\/|[A-Z]:\\/i);
  });

  it('includes the required provisional governance statements', () => {
    expect(createUsabilityExport(session()).governance).toEqual({
      humanVisualReview: 'PENDING',
      baseline: 'PROVISIONAL_NOT_FINAL',
      notices: [
        'Human visual review remains pending.',
        'Development continued under a documented provisional internal-prototype decision.',
      ],
      scopeNoticeZh: '本测试仅评估数字定制器的可用性和视觉理解，不代表制造、高速战斗、安全认证或真实物理性能结论。',
    });
  });

  it('performs no network upload while creating or serializing an export', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    createUsabilityExport(session());
    serializeUsabilityExport(session());
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
