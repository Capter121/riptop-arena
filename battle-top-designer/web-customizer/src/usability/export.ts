import type { UsabilitySession } from './session';

const governance = {
  humanVisualReview: 'PENDING' as const,
  baseline: 'PROVISIONAL_NOT_FINAL' as const,
  notices: [
    'Human visual review remains pending.',
    'Development continued under a documented provisional internal-prototype decision.',
  ],
  scopeNoticeZh: '本测试仅评估数字定制器的可用性和视觉理解，不代表制造、高速战斗、安全认证或真实物理性能结论。',
};

const forbiddenKeys = new Set([
  'name', 'fullname', 'nickname', 'email', 'phone', 'telephone', 'address', 'ip',
  'ipaddress', 'useragent', 'geolocation', 'latitude', 'longitude', 'hostname',
  'machine', 'path', 'stack', 'notes', 'comment', 'freetext', 'localstorage',
]);

export function createUsabilityExport(session: UsabilitySession) {
  return {
    schemaVersion: session.schemaVersion,
    sessionId: session.sessionId,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    status: session.status,
    tasks: session.tasks.map(task => ({
      id: task.id,
      status: task.status,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      durationMs: task.durationMs,
      combinationId: task.combinationId,
      selectedPartIds: [...task.selectedPartIds],
      viewedPartIds: [...task.viewedPartIds],
      viewOrder: [...task.viewOrder],
      focusReadoutPartIds: [...task.focusReadoutPartIds],
      finalSelection: task.finalSelection,
      assistFeedback: task.assistFeedback,
      completionMethod: task.completionMethod,
      errorCodes: [...task.errorCodes],
    })),
    finalCombinationId: session.finalCombinationId,
    selectedPartIds: [...session.selectedPartIds],
    errors: [...session.errors],
    governance,
  };
}

export function findForbiddenExportFields(value: unknown): string[] {
  const found: string[] = [];
  const visit = (current: unknown) => {
    if (Array.isArray(current)) return current.forEach(visit);
    if (!current || typeof current !== 'object') return;
    for (const [key, child] of Object.entries(current)) {
      if (forbiddenKeys.has(key.toLowerCase())) found.push(key);
      visit(child);
    }
  };
  visit(value);
  return found;
}

export function serializeUsabilityExport(session: UsabilitySession): string {
  const payload = createUsabilityExport(session);
  const forbidden = findForbiddenExportFields(payload);
  if (forbidden.length) throw new Error(`Forbidden export fields: ${forbidden.join(', ')}`);
  return `${JSON.stringify(payload, null, 2)}\n`;
}
