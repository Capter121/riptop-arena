export type FocusDiagnosticEvent = {
  at: number;
  type: string;
  sessionId: number;
  target: string | null;
  phase: string;
  details?: Record<string, unknown>;
};

let enabled = false;
let events: FocusDiagnosticEvent[] = [];
let nextObjectId = 1;
const objectIds = new WeakMap<object, number>();

export function focusObjectId(value: object) {
  const existing = objectIds.get(value);
  if (existing) return existing;
  const id = nextObjectId;
  nextObjectId += 1;
  objectIds.set(value, id);
  return id;
}

export function setFocusDiagnostics(value: boolean) {
  enabled = value;
  if (!value) events = [];
}

export function clearFocusDiagnostics() { events = []; }

export function recordFocusDiagnostic(event: Omit<FocusDiagnosticEvent, 'at'>) {
  if (!enabled) return;
  events.push({ at: performance.now(), ...event });
  if (events.length > 500) events = events.slice(-500);
}

export function focusDiagnosticEvents() {
  return events.map(event => ({ ...event, details: event.details ? { ...event.details } : undefined }));
}
