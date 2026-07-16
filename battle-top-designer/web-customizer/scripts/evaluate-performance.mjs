const thresholds = Object.freeze({
  desktopInteractionMs: 4_000,
  mobileInteractionMs: 6_000,
  coldSwitchMs: 1_500,
  cachedSwitchMs: 300,
  heapGrowthBytes: 10_000_000,
  heapGrowthRatio: 0.15,
});

function resourceGrowth(memory) {
  const before = memory.resourcesBefore;
  const after = memory.resourcesAfter;
  if (!before || !after) return true;
  return ['geometries', 'textures', 'programs'].some(key => after[key] > before[key]);
}

export function evaluatePerformance(report) {
  const errors = [];
  let memoryNotMeasurable = false;
  for (const profileName of ['desktop', 'mobile']) {
    const profile = report.profiles?.[profileName];
    const prefix = profileName.toUpperCase();
    if (!profile) {
      errors.push(`${prefix}_METRICS_MISSING`);
      continue;
    }
    const interactionBudget = profileName === 'desktop'
      ? thresholds.desktopInteractionMs
      : thresholds.mobileInteractionMs;
    if (profile.coldCache?.interactionReadyMs?.median > interactionBudget) errors.push(`${prefix}_INTERACTION_BUDGET`);
    if (profile.coldSwitchMs?.p95 > thresholds.coldSwitchMs) errors.push(`${prefix}_COLD_SWITCH_BUDGET`);
    if (profile.cachedSwitchMs?.p95 > thresholds.cachedSwitchMs) errors.push(`${prefix}_CACHED_SWITCH_BUDGET`);
    if (Object.values(profile.errors ?? {}).some(value => value !== 0)) errors.push(`${prefix}_BROWSER_ERRORS`);

    const memory = profile.memory;
    if (memory?.status !== 'MEASURED') {
      memoryNotMeasurable = true;
      errors.push(`${prefix}_MEMORY_NOT_MEASURABLE`);
      continue;
    }
    const allowedGrowth = Math.max(thresholds.heapGrowthBytes, memory.beforeBytes * thresholds.heapGrowthRatio);
    if (memory.deltaBytes > allowedGrowth) errors.push(`${prefix}_HEAP_GROWTH`);
    if (resourceGrowth(memory)) errors.push(`${prefix}_WEBGL_RESOURCE_GROWTH`);
  }
  if (errors.some(error => !error.endsWith('_MEMORY_NOT_MEASURABLE'))) return { status: 'FAIL', errors };
  if (memoryNotMeasurable) return { status: 'NOT_MEASURABLE', errors };
  return { status: 'PASS', errors };
}

export { thresholds };
