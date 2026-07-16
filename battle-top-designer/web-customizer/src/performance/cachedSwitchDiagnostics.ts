export const CACHED_SWITCH_MARKS = [
  'cached-switch:intent',
  'cached-switch:store-start',
  'cached-switch:cache-hit',
  'cached-switch:clone-start',
  'cached-switch:clone-complete',
  'cached-switch:mount-complete',
  'cached-switch:react-commit',
  'cached-switch:first-frame',
  'cached-switch:stable-frame',
  'cached-switch:complete',
] as const;

export type CachedSwitchMark = (typeof CACHED_SWITCH_MARKS)[number];
export type CachedSwitchResources = { geometries: number; textures: number; programs: number };
export type CachedSwitchMeta = {
  family: string;
  previousPartId: string;
  nextPartId: string;
  combinationId: string;
  focusState: string;
  cacheHit: boolean;
};

export type CachedSwitchSample = CachedSwitchMeta & {
  session: number;
  marks: Record<string, number>;
  stages: Record<string, number>;
  totalDurationMs: number;
  heapBefore: number | null;
  heapAfter: number | null;
  resourcesBefore: CachedSwitchResources;
  resourcesAfter: CachedSwitchResources;
  gcLongTask: boolean;
  longTasksOver50Ms: number;
  rootCloneDurationMs: number;
  materialPreparationDurationMs: number;
  mountCalculationDurationMs: number;
};

type ActiveSwitch = CachedSwitchMeta & {
  session: number;
  marks: Record<string, number>;
  heapBefore: number | null;
  resourcesBefore: CachedSwitchResources;
  gcLongTask: boolean;
  longTasksOver50Ms: number;
  rootCloneDurationMs: number;
  materialPreparationDurationMs: number;
  mountCalculationDurationMs: number;
};

const emptyResources = (): CachedSwitchResources => ({ geometries: 0, textures: 0, programs: 0 });

export class CachedSwitchRecorder {
  private enabled = false;
  private nextSession = 0;
  private active: ActiveSwitch | null = null;
  private retained: CachedSwitchSample[] = [];

  constructor(
    private readonly now: () => number,
    private readonly heap: () => number | null,
    private readonly resources: () => CachedSwitchResources,
    private readonly limit = 300,
    private readonly markTarget?: Pick<Performance, 'mark'>,
  ) {}

  enable(value = true) { this.enabled = value; }
  isEnabled() { return this.enabled; }
  clear() { this.active = null; this.retained = []; }
  activeCombinationId() { return this.active?.combinationId ?? null; }
  samples() { return this.retained.map(sample => structuredClone(sample)); }

  begin(meta: CachedSwitchMeta) {
    if (!this.enabled) return null;
    const at = this.now();
    this.markTarget?.mark('cached-switch:intent');
    this.active = {
      ...meta,
      session: ++this.nextSession,
      marks: { 'cached-switch:intent': at },
      heapBefore: this.heap(),
      resourcesBefore: { ...this.resources() },
      gcLongTask: false,
      longTasksOver50Ms: 0,
      rootCloneDurationMs: 0,
      materialPreparationDurationMs: 0,
      mountCalculationDurationMs: 0,
    };
    return this.active.session;
  }

  mark(name: CachedSwitchMark, metrics: Partial<Pick<ActiveSwitch, 'rootCloneDurationMs' | 'materialPreparationDurationMs' | 'mountCalculationDurationMs'>> = {}) {
    if (!this.active || this.active.marks[name] !== undefined) return false;
    this.active.marks[name] = this.now();
    Object.assign(this.active, metrics);
    this.markTarget?.mark(name);
    return true;
  }

  recordPerformanceEntry(entry: { name: string; entryType: string; startTime: number; duration: number }) {
    if (!this.active || entry.startTime < this.active.marks['cached-switch:intent']) return;
    if (entry.entryType === 'gc') this.active.gcLongTask ||= entry.duration > 50;
    if (entry.entryType === 'longtask' && entry.duration > 50) this.active.longTasksOver50Ms += 1;
  }

  complete(displayedCombinationId: string) {
    if (!this.active || this.active.combinationId !== displayedCombinationId || this.active.marks['cached-switch:stable-frame'] === undefined) return null;
    this.mark('cached-switch:complete');
    const active = this.active;
    const stages: Record<string, number> = {};
    for (let index = 1; index < CACHED_SWITCH_MARKS.length; index += 1) {
      const previous = active.marks[CACHED_SWITCH_MARKS[index - 1]];
      const current = active.marks[CACHED_SWITCH_MARKS[index]];
      if (previous !== undefined && current !== undefined) stages[CACHED_SWITCH_MARKS[index]] = current - previous;
    }
    const totalDurationMs = active.marks['cached-switch:complete'] - active.marks['cached-switch:intent'];
    stages.total = totalDurationMs;
    const sample: CachedSwitchSample = {
      ...active,
      marks: { ...active.marks },
      stages,
      totalDurationMs,
      heapAfter: this.heap(),
      resourcesAfter: { ...this.resources() },
    };
    this.retained.push(sample);
    if (this.retained.length > this.limit) this.retained.splice(0, this.retained.length - this.limit);
    this.active = null;
    return structuredClone(sample);
  }
}

function percentile(values: number[], ratio: number) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)] ?? 0;
}

export function summarizeCachedSwitches(samples: CachedSwitchSample[]) {
  const totals = samples.map(sample => sample.totalDurationMs);
  const stageNames = [...new Set(samples.flatMap(sample => Object.keys(sample.stages)))];
  return {
    sampleCount: samples.length,
    p50: percentile(totals, 0.5),
    p90: percentile(totals, 0.9),
    p95: percentile(totals, 0.95),
    p99: percentile(totals, 0.99),
    max: Math.max(0, ...totals),
    stageP95: Object.fromEntries(stageNames.map(name => [name, percentile(samples.map(sample => sample.stages[name] ?? 0), 0.95)])),
    slowest: [...samples].sort((left, right) => right.totalDurationMs - left.totalDurationMs).slice(0, 10),
  };
}

const browserPerformance = () => typeof performance === 'undefined' ? null : performance;
let resourceProvider = emptyResources;
const singleton = new CachedSwitchRecorder(
  () => browserPerformance()?.now() ?? 0,
  () => Number((browserPerformance() as any)?.memory?.usedJSHeapSize) || null,
  () => resourceProvider(),
  300,
  browserPerformance() ?? undefined,
);
let observer: PerformanceObserver | null = null;
const preparedParts = new Set<string>();

export function enableCachedSwitchDiagnostics(value = true) {
  singleton.enable(value);
  if (!value || observer || typeof PerformanceObserver === 'undefined') return;
  const supported = PerformanceObserver.supportedEntryTypes.filter(type => type === 'longtask' || type === 'gc');
  if (!supported.length) return;
  observer = new PerformanceObserver(list => list.getEntries().forEach(entry => singleton.recordPerformanceEntry(entry)));
  supported.forEach(type => observer?.observe({ type, buffered: true }));
}

export function setCachedSwitchResourceProvider(provider: () => CachedSwitchResources) { resourceProvider = provider; }
export function clearCachedSwitchDiagnostics() { singleton.clear(); }
export function beginCachedSwitch(meta: CachedSwitchMeta) { return singleton.begin(meta); }
export function markCachedSwitch(name: CachedSwitchMark, metrics?: Parameters<CachedSwitchRecorder['mark']>[1]) { return singleton.mark(name, metrics); }
export function completeCachedSwitch(combinationId: string) { return singleton.complete(combinationId); }
export function cachedSwitchSamples() { return singleton.samples(); }
export function activeCachedSwitchCombination() { return singleton.activeCombinationId(); }
export function cachedSwitchDiagnosticsEnabled() { return singleton.isEnabled(); }
export function markPartPrepared(partId: string) { preparedParts.add(partId); }
export function wasPartPrepared(partId: string) { return preparedParts.has(partId); }
