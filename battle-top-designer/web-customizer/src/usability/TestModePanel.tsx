import { useEffect, useMemo, useRef, useState } from 'react';
import { combinationId, partById } from '../domain';
import { useCustomizer } from '../store';
import { serializeUsabilityExport } from './export';
import { usabilityActionEvent, type UsabilityAction } from './events';
import {
  applyUsabilityEvent, canCompleteCurrentTask, createUsabilitySession, currentUsabilityTask,
  type AssistFeedback, type UsabilityEvent, type UsabilitySession, type UsabilityTaskId,
} from './session';
import { clearUsabilitySession, loadUsabilitySession, saveUsabilitySession } from './storage';

const taskCopy: Record<UsabilityTaskId, { title: string; instruction: string }> = {
  'attack-combination': { title: '1. Create an attack-oriented combination', instruction: 'Choose parts until the result looks attack-oriented to you, then mark the task complete.' },
  'assist-comparison': { title: '2. Compare all three Assist Rings', instruction: 'Load Heavy, Guard, and Air; observe each focus readout; choose the easiest to identify and answer the fixed feedback question.' },
  'gear-comparison': { title: '3. Compare Gear height', instruction: 'Load Low, Medium, and High and observe each one in the side-view focus.' },
  'tip-comparison': { title: '4. Compare Tip contact shapes', instruction: 'Load Flat, Ball, Needle, and Taper and observe each one in the bottom-view focus.' },
  'favorite-restore': { title: '5. Save and restore a favorite', instruction: 'Optionally add a nickname, save the current combination as a favorite, then restore that same favorite.' },
  'share-or-export': { title: '6. Share or export', instruction: 'Successfully copy a share link, generate its QR code, or export a PNG combination card.' },
};

const feedbackOptions: { value: AssistFeedback; label: string }[] = [
  { value: 'ALL_EASY', label: 'All three are easy to distinguish' },
  { value: 'TWO_CONFUSING', label: 'Two are easy to confuse' },
  { value: 'ALL_DIFFICULT', label: 'All three are difficult to distinguish' },
  { value: 'UNSURE', label: 'Unsure' },
];

function initialSession() {
  const loaded = loadUsabilitySession();
  if (loaded.status === 'ok') return { session: loaded.session, warning: '' };
  if (loaded.status === 'missing') return { session: createUsabilitySession(), warning: '' };
  if (loaded.status === 'denied') return { session: createUsabilitySession(), warning: 'Local storage is unavailable. This session can be exported but not restored after refresh.' };
  return {
    session: null,
    warning: loaded.status === 'version_mismatch'
      ? 'A test session from another schema version was isolated. Clear it before starting again.'
      : 'The stored test session is corrupt and was isolated. Clear it before starting again.',
  };
}

function download(session: UsabilitySession) {
  const blob = new Blob([serializeUsabilityExport(session)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `nss-usability-${session.sessionId}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function TestModePanel() {
  const [{ session: initial, warning: initialWarning }] = useState(initialSession);
  const [session, setSession] = useState<UsabilitySession | null>(initial);
  const [warning, setWarning] = useState(initialWarning);
  const [collapsed, setCollapsed] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const combination = useCustomizer(state => state.combination);
  const loadState = useCustomizer(state => state.loadState);
  const cameraPreset = useCustomizer(state => state.cameraPreset);
  const focusState = useCustomizer(state => state.focusState);
  const currentId = combinationId(combination);
  const pendingSelection = useRef<{ partId: string; combinationId: string } | null>(null);
  const storageFailureRecorded = useRef(false);

  const update = (event: UsabilityEvent) => setSession(current => current ? applyUsabilityEvent(current, event) : current);
  const task = session ? currentUsabilityTask(session) : null;
  const canComplete = session ? canCompleteCurrentTask(session) : false;
  const exportPreview = useMemo(() => session ? serializeUsabilityExport(session) : '', [session]);

  useEffect(() => {
    if (!session) return;
    if (saveUsabilitySession(session)) return;
    setWarning('Local storage is unavailable. Export the result before leaving this page.');
    if (!storageFailureRecorded.current) {
      storageFailureRecorded.current = true;
      setSession(current => current ? applyUsabilityEvent(current, { type: 'SYSTEM_ERROR', code: 'STORAGE_FAILED' }) : current);
    }
  }, [session]);

  useEffect(() => {
    const onAction = (event: Event) => {
      const action = (event as CustomEvent<UsabilityAction>).detail;
      if (action.type === 'PART_SELECTED') {
        pendingSelection.current = action;
        update(action);
      } else if (action.type === 'FAVORITE_SAVED' || action.type === 'FAVORITE_RESTORED' || action.type === 'SHARE_SUCCEEDED' || action.type === 'SYSTEM_ERROR') {
        update(action);
      }
    };
    window.addEventListener(usabilityActionEvent, onAction);
    return () => window.removeEventListener(usabilityActionEvent, onAction);
  }, []);

  useEffect(() => {
    const pending = pendingSelection.current;
    if (!pending || loadState !== 'ready' || pending.combinationId !== currentId) return;
    const part = partById.get(pending.partId);
    if (!part || combination[part.family] !== part.id) return;
    update({ type: 'PART_READY', partId: part.id, family: part.family, cameraPreset, combinationId: currentId });
    pendingSelection.current = null;
  }, [cameraPreset, combination, currentId, loadState]);

  useEffect(() => {
    if (!focusState.readoutCommitted || !focusState.modelReady || !focusState.target || !focusState.partId) return;
    update({ type: 'FOCUS_READOUT_VISIBLE', partId: focusState.partId, target: focusState.target });
  }, [focusState.modelReady, focusState.partId, focusState.readoutCommitted, focusState.sessionId, focusState.target]);

  useEffect(() => {
    if (task?.id !== 'share-or-export' || task.completionMethod || !document.querySelector('.share-qr svg')) return;
    update({ type: 'SHARE_SUCCEEDED', method: 'qr' });
  }, [task?.completionMethod, task?.id]);

  const restart = () => {
    clearUsabilitySession();
    storageFailureRecorded.current = false;
    pendingSelection.current = null;
    setWarning('');
    setSession(createUsabilitySession());
    setPreviewOpen(false);
  };

  const clear = () => {
    if (!clearUsabilitySession()) setWarning('The test session could not be cleared from local storage.');
    else setWarning('Test session cleared. Start a new session when ready.');
    setSession(null);
    setPreviewOpen(false);
  };

  return (
    <aside className={`test-mode-panel ${collapsed ? 'collapsed' : ''}`} data-testid="test-mode-panel" aria-label="Anonymous usability test tasks">
      <header>
        <div><span className="eyebrow">INTERNAL ANONYMOUS TEST</span><h2>{session?.status === 'COMPLETED' ? 'Session completed' : session?.status === 'ABANDONED' ? 'Session ended' : 'Task guide'}</h2></div>
        <button data-testid="test-panel-toggle" aria-expanded={!collapsed} onClick={() => setCollapsed(value => !value)}>{collapsed ? 'Expand' : 'Collapse'}</button>
      </header>
      {!collapsed && (
        <div className="test-mode-content">
          <p className="test-governance">Human visual review remains pending.<br />Development continued under a documented provisional internal-prototype decision.</p>
          <p>本测试仅评估数字定制器的可用性和视觉理解，不代表制造、高速战斗、安全认证或真实物理性能结论。</p>
          {warning && <p className="test-warning" role="alert" data-testid="test-storage-warning">{warning}</p>}
          {!session ? (
            <button data-testid="test-restart" className="primary" onClick={restart}>Start a new anonymous session</button>
          ) : task ? (
            <section data-testid={`test-task-${task.id}`}>
              <p className="test-progress">Task {session.tasks.findIndex(item => item.id === task.id) + 1} of 6 · <strong>{task.status}</strong></p>
              <h3>{taskCopy[task.id].title}</h3>
              <p>{taskCopy[task.id].instruction}</p>
              {(task.id === 'assist-comparison' || task.id === 'gear-comparison' || task.id === 'tip-comparison') && (
                <p data-testid="test-viewed-progress">Viewed with required focus: {task.viewedPartIds.length}/{task.id === 'tip-comparison' ? 4 : 3}</p>
              )}
              {task.id === 'assist-comparison' && (
                <fieldset><legend>Which fixed statement best matches your comparison?</legend>{feedbackOptions.map(option => (
                  <label key={option.value}><input type="radio" name="assist-feedback" value={option.value} checked={task.assistFeedback === option.value} onChange={() => update({ type: 'SET_ASSIST_FEEDBACK', value: option.value })} /> {option.label}</label>
                ))}</fieldset>
              )}
              <div className="test-task-actions">
                <button data-testid="test-complete-task" className="primary" disabled={!canComplete} onClick={() => update({
                  type: 'COMPLETE_TASK', combinationId: currentId,
                  selectedPartId: task.id === 'assist-comparison' ? combination.assist : task.id === 'gear-comparison' ? combination.gear : task.id === 'tip-comparison' ? combination.tip : undefined,
                })}>Mark task complete</button>
                <button data-testid="test-skip-task" onClick={() => update({ type: 'SKIP_TASK', combinationId: currentId })}>Skip task</button>
                <button data-testid="test-end-session" onClick={() => update({ type: 'ABANDON_SESSION', combinationId: currentId })}>End test</button>
              </div>
            </section>
          ) : <p data-testid="test-session-status">{session.status}. No new session will start automatically.</p>}
          {session && (
            <section className="test-export">
              <button data-testid="test-export-preview-toggle" onClick={() => setPreviewOpen(value => !value)}>{previewOpen ? 'Hide export preview' : 'Preview export fields'}</button>
              <button data-testid="test-export-download" onClick={() => download(session)}>Export Test Result JSON</button>
              <button data-testid="test-clear-session" onClick={clear}>Clear session</button>
              <button data-testid="test-restart-session" onClick={restart}>Restart test</button>
              {previewOpen && <pre data-testid="test-export-preview">{exportPreview}</pre>}
            </section>
          )}
        </div>
      )}
    </aside>
  );
}
