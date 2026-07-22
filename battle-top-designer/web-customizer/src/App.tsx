import { Component, lazy, Suspense, type ErrorInfo, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { conceptAttributes, attributeNames } from './attributes';
import {
  combinationId, combinationName, enumerateCombinations, families, familyParts, parseCombinationJson,
  partById, randomCombination, serializeCombination, type Family,
} from './domain';
import {
  addRecent, readLibrary, removeFavorite, setNickname as setLibraryNickname, toggleFavorite, writeLibrary,
} from './library/localLibrary';
import { captureScene } from './diagnostics';
import { beginPartSwitch, markOnce } from './performance/marks';
import {
  cachedSwitchSamples, clearCachedSwitchDiagnostics, enableCachedSwitchDiagnostics,
  markCachedSwitch, wasPartPrepared,
} from './performance/cachedSwitchDiagnostics';
import { focusReadoutTarget, scheduleFocusPulseEnd } from './focusLifecycle';
import { FocusReadout } from './focusPresentationController';
import { clearFocusDiagnostics, focusDiagnosticEvents, recordFocusDiagnostic, setFocusDiagnostics } from './focusDiagnostics';
import { createShareLink } from './sharing/combinationUrl';
import { copyShareLink } from './sharing/shareLink';
import { createArenaLink } from './integration/arenaLink';
import { currentSnapshot, useCustomizer } from './store';
import { emitUsabilityAction } from './usability/events';
import './styles.css';

const CustomizerScene = lazy(() => import('./Scene').then(module => ({ default: module.CustomizerScene })));
const QrCodeView = lazy(() => import('./sharing/QrCodeView').then(module => ({ default: module.QrCodeView })));
const TestModePanel = lazy(() => import('./usability/TestModePanel'));

const familyLabels: Record<Family, string> = {
  core: 'Core', blade: 'Main Blade', assist: 'Assist Ring', gear: 'Height Gear', tip: 'Performance Tip',
};
const attributeLabels = { attack: 'attack', defense: 'defense', stamina: 'stamina', balance: 'balance', weight: '重量倾向', height: '高度倾向' } as const;

class SceneErrorBoundary extends Component<{ resetKey: string; children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    useCustomizer.getState().setLoadState('error', error.message);
    if (useCustomizer.getState().testMode) emitUsabilityAction({ type: 'SYSTEM_ERROR', code: 'GLB_LOAD_FAILED' });
    console.error('GLB_LOAD_ERROR', error, info.componentStack);
  }
  componentDidUpdate(previous: { resetKey: string }) {
    if (previous.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  render() { return this.state.error ? <div className="scene-error">Model load failed: {this.state.error}</div> : this.props.children; }
}

export default function App() {
  const state = useCustomizer();
  const [notice, setNotice] = useState(state.startupNotice ?? '');
  const [shareOpen, setShareOpen] = useState(false);
  const [cardExporting, setCardExporting] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [library, setLibrary] = useState(readLibrary);
  const [nickname, setNickname] = useState('');
  const importRef = useRef<HTMLInputElement>(null);
  const lastRecentId = useRef<string | null>(null);
  const pendingFavoriteRestore = useRef<string | null>(null);
  const appRenderSequence = useRef(0);
  appRenderSequence.current += 1;
  const id = combinationId(state.combination);
  const attributes = useMemo(() => conceptAttributes(state.combination), [state.combination]);
  const selectedAssist = familyParts.assist.find(part => part.id === state.combination.assist)!;
  const selectedGear = familyParts.gear.find(part => part.id === state.combination.gear)!;
  const lowGearHeight = familyParts.gear.find(part => part.id === 'gear_low')!.heightMm;
  const share = useMemo(() => createShareLink(
    state.combination,
    new URL(window.location.href),
    import.meta.env.VITE_SHARE_BASE_URL,
  ), [state.combination]);
  const arenaLink = useMemo(() => createArenaLink(
    state.combination,
    new URL(window.location.href),
    import.meta.env.VITE_ARENA_URL,
  ), [state.combination]);
  const currentLibraryEntry = [...library.favorites, ...library.recent].find(entry => entry.id === id);
  const automaticName = combinationName(state.combination);
  const focusSessionId = useCustomizer(current => current.focusState.sessionId);
  const focusRevision = useCustomizer(current => current.focusState.revision);
  const focusTarget = useCustomizer(current => current.focusState.target);
  const focusPhase = useCustomizer(current => current.focusState.phase);
  const focusPartId = useCustomizer(current => current.focusState.partId);
  const focusModelReady = useCustomizer(current => current.focusState.modelReady);
  const focusPulseActive = useCustomizer(current => current.focusState.pulseActive);
  const focusReadoutCommitted = useCustomizer(current => current.focusState.readoutCommitted);
  const focusActiveFramePainted = useCustomizer(current => current.focusState.activeFramePainted);
  const focusPresentationComplete = useCustomizer(current => current.focusState.presentationCompleteRequested);
  const focusState = useMemo(() => ({
    sessionId: focusSessionId,
    revision: focusRevision,
    target: focusTarget,
    phase: focusPhase,
    partId: focusPartId,
    modelReady: focusModelReady,
    pulseActive: focusPulseActive,
    readoutCommitted: focusReadoutCommitted,
    activeFramePainted: focusActiveFramePainted,
    presentationCompleteRequested: focusPresentationComplete,
  }), [focusActiveFramePainted, focusModelReady, focusPartId, focusPhase, focusPresentationComplete, focusPulseActive, focusReadoutCommitted, focusRevision, focusSessionId, focusTarget]);
  const readoutTarget = focusReadoutTarget(focusState);

  useLayoutEffect(() => {
    const readoutMounted = readoutTarget
      ? Boolean(document.querySelector(`[data-testid="${readoutTarget === 'gear' ? 'gear-height' : readoutTarget === 'tip' ? 'tip-contact' : 'assist-focus'}-readout"]`))
      : false;
    recordFocusDiagnostic({
      type: 'app-readout-commit',
      sessionId: focusState.sessionId,
      target: focusState.target,
      phase: focusState.phase,
      details: {
        revision: focusState.revision,
        appRenderSequence: appRenderSequence.current,
        readoutPredicate: readoutTarget !== null,
        readoutMounted,
        selectedPartId: focusState.partId,
        activeCombinationId: id,
      },
    });
    if (focusState.phase !== 'idle' && readoutMounted) {
      useCustomizer.getState().markFocusReadoutCommitted(focusState.sessionId);
    }
  }, [focusState, readoutTarget]);

  useEffect(() => {
    markOnce('phase3b:shell-ready');
    const selectPartForDiagnostics = (partId: string) => {
      const current = useCustomizer.getState();
      const part = partById.get(partId);
      if (!part) return current.selectPart(partId);
      const nextCombination = { ...current.combination, [part.family]: partId };
      beginPartSwitch({
        family: part.family,
        previousPartId: current.combination[part.family],
        nextPartId: partId,
        combinationId: combinationId(nextCombination),
        focusState: current.focusState.phase,
        cacheHit: wasPartPrepared(partId),
      });
      markCachedSwitch('cached-switch:store-start');
      current.selectPart(partId);
    };
    (window as any).__NSS_CUSTOMIZER__ = {
      snapshot: currentSnapshot,
      restore: () => useCustomizer.getState().restorePresentation(),
      enumerateIds: () => enumerateCombinations().map(combinationId),
      selectBladeForDiagnostics: (partId: string) => {
        useCustomizer.getState().selectFamily('blade');
        selectPartForDiagnostics(partId);
      },
      setCachedSwitchDiagnostics: (enabled: boolean) => enableCachedSwitchDiagnostics(enabled),
      clearCachedSwitchDiagnostics,
      cachedSwitchSamples,
      setFocusDiagnostics,
      clearFocusDiagnostics,
      focusDiagnosticEvents,
    };
  }, []);

  useEffect(() => {
    if (focusState.phase !== 'active' || !focusState.pulseActive) return;
    return scheduleFocusPulseEnd(focusState.sessionId, session => useCustomizer.getState().endFocusPulse(session));
  }, [focusState.phase, focusState.pulseActive, focusState.sessionId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      const current = useCustomizer.getState();
      if (current.loadState !== 'ready' || (event.shiftKey ? !current.canRedo : !current.canUndo)) return;
      event.preventDefault();
      beginPartSwitch();
      if (event.shiftKey) current.redo(); else current.undo();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (state.loadState !== 'ready' || lastRecentId.current === id) return;
    lastRecentId.current = id;
    setLibrary(current => {
      const next = addRecent(current, state.combination);
      if (!writeLibrary(next)) setNotice('Recent combinations could not be saved on this device.');
      return next;
    });
  }, [id, state.combination, state.loadState]);

  useEffect(() => { setNickname(currentLibraryEntry?.nickname ?? ''); }, [id, currentLibraryEntry?.nickname]);

  useEffect(() => {
    if (!state.testMode || state.loadState !== 'ready' || pendingFavoriteRestore.current !== id) return;
    emitUsabilityAction({ type: 'FAVORITE_RESTORED', combinationId: id });
    pendingFavoriteRestore.current = null;
  }, [id, state.loadState, state.testMode]);

  const persistLibrary = (next: typeof library, success: string) => {
    setLibrary(next);
    const saved = writeLibrary(next);
    setNotice(saved ? success : 'Local library storage is unavailable. Your current combination is unchanged.');
    if (!saved && state.testMode) emitUsabilityAction({ type: 'SYSTEM_ERROR', code: 'STORAGE_FAILED' });
    return saved;
  };

  const choosePart = (partId: string) => {
    const part = partById.get(partId);
    if (!part) return state.selectPart(partId);
    const nextCombination = { ...state.combination, [part.family]: partId };
    beginPartSwitch({
      family: part.family,
      previousPartId: state.combination[part.family],
      nextPartId: partId,
      combinationId: combinationId(nextCombination),
      focusState: state.focusState.phase,
      cacheHit: wasPartPrepared(partId),
    });
    markCachedSwitch('cached-switch:store-start');
    if (state.testMode) emitUsabilityAction({ type: 'PART_SELECTED', partId, combinationId: combinationId(nextCombination) });
    state.selectPart(partId);
  };

  const toggleCurrentFavorite = () => {
    const alreadyFavorite = library.favorites.some(entry => entry.id === id);
    if (persistLibrary(toggleFavorite(library, state.combination), alreadyFavorite ? 'Favorite removed.' : 'Favorite saved locally.') && state.testMode && !alreadyFavorite) {
      emitUsabilityAction({ type: 'FAVORITE_SAVED', combinationId: id });
    }
  };

  const restoreFavorite = (entry: (typeof library.favorites)[number]) => {
    if (state.testMode) pendingFavoriteRestore.current = entry.id;
    state.replaceCombination(entry.combination);
  };

  const completeFocusPresentation = (session: number) => {
    const current = useCustomizer.getState().focusState;
    recordFocusDiagnostic({
      type: 'focus-presentation-animation-complete',
      sessionId: session,
      target: current.target,
      phase: current.phase,
      details: { revision: current.revision, partId: current.partId, activeFramePainted: current.activeFramePainted },
    });
    useCustomizer.getState().completeFocusPresentation(session);
  };

  const exportJson = () => {
    const blob = new Blob([serializeCombination(state.combination)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `${id}.json`; anchor.click();
    URL.revokeObjectURL(url); setNotice('Combination JSON exported.');
  };

  const importJson = async (file?: File) => {
    if (!file) return;
    try { state.replaceCombination(parseCombinationJson(await file.text())); setNotice('Combination imported.'); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Import failed.'); }
  };

  const exportCard = async () => {
    if (cardExporting) return;
    setCardExporting(true);
    try {
      const capture = await captureScene(720, 630);
      const { renderCombinationCard } = await import('./sharing/cardRenderer');
      const blob = await renderCombinationCard({
        combination: state.combination,
        shareUrl: share.url,
        sceneWidth: capture.width,
        sceneHeight: capture.height,
        pixels: capture.pixels,
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${id}.png`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setNotice('Combination card exported.');
      if (state.testMode) emitUsabilityAction({ type: 'SHARE_SUCCEEDED', method: 'png' });
    } catch (error) {
      setNotice(error instanceof Error ? `Card export failed: ${error.message} Retry when the model is ready.` : 'Card export failed. Retry when the model is ready.');
      if (state.testMode) emitUsabilityAction({ type: 'SYSTEM_ERROR', code: 'SHARE_FAILED' });
    } finally {
      setCardExporting(false);
    }
  };

  return (
    <main className={`app-shell ${state.testMode ? 'test-mode-enabled' : ''}`}>
      <header className="topbar">
        <div><span className="eyebrow">NOVA SPIN SYSTEM</span><h1>Internal Customizer</h1></div>
        <span className="prototype-badge">PROVISIONAL PROTOTYPE</span>
      </header>

      {state.testMode && <Suspense fallback={<p className="test-panel-loading">Loading anonymous test guide…</p>}><TestModePanel /></Suspense>}

      <section className="viewer" aria-label="3D customizer viewport">
        <SceneErrorBoundary resetKey={id}><Suspense fallback={<div className="scene-runtime-loading">Loading local 3D runtime…</div>}><CustomizerScene combination={state.combination} /></Suspense></SceneErrorBoundary>
        <div className={`load-status ${state.loadState}`} data-testid="load-status" data-state={state.loadState}>
          {state.loadState === 'loading' ? `Loading local assets… ${state.loadProgress}%` : state.loadState === 'error' ? state.error : 'Offline model ready'}
        </div>
        <div className="viewer-tools" aria-label="Camera controls">
          <div className="viewer-tool-group viewer-tool-group-primary">
            {!state.showcaseEnabled && (['top', 'perspective', 'side', 'bottom'] as const).map(preset => (
              <button key={preset} data-testid={`camera-${preset}`} className={state.cameraPreset === preset ? 'active' : ''} onClick={() => state.setCamera(preset)}>{preset === 'perspective' ? '45°' : preset}</button>
            ))}
            <button data-testid="showcase" className={state.showcaseEnabled ? 'active' : ''} aria-pressed={state.showcaseEnabled} onClick={() => state.setShowcaseEnabled(!state.showcaseEnabled)}>Showcase</button>
            {state.showcaseEnabled && <div className="showcase-controls" role="group" aria-label="Showcase controls">
              {(['hero', 'top', 'side', 'exploded'] as const).map(preset => (
                <button key={preset} data-testid={`showcase-${preset}`} className={state.showcaseCameraPreset === preset ? 'active' : ''} onClick={() => state.setShowcaseCameraPreset(preset)}>{preset}</button>
              ))}
              <button data-testid="turntable" className={state.turntableEnabled ? 'active' : ''} aria-pressed={state.turntableEnabled} onClick={() => state.setTurntableEnabled(!state.turntableEnabled)}>Turntable</button>
              {state.turntableEnabled && (['slow', 'normal'] as const).map(speed => (
                <button key={speed} data-testid={`turntable-${speed}`} className={state.turntableSpeed === speed ? 'active' : ''} onClick={() => state.setTurntableSpeed(speed)}>{speed}</button>
              ))}
            </div>}
          </div>
          <div className="viewer-tool-group" aria-label="Viewer utilities">
            <button data-testid="reset-view" onClick={state.restorePresentation}>Reset</button>
            <button data-testid="debug-axis" aria-pressed={state.debugAxis} onClick={() => state.setDebugAxis(!state.debugAxis)}>Axis</button>
            <button data-testid="low-performance" aria-pressed={state.lowPerformance} onClick={() => state.setLowPerformance(!state.lowPerformance)}>Low performance</button>
          </div>
          <div className="viewer-tool-group identity-controls" aria-label="Identity controls">
            {state.combination.core === 'core_solar_wolf' && <button data-testid="solar-wolf-badge" aria-pressed={state.solarWolfBadgeEnabled} onClick={() => state.setSolarWolfBadgeEnabled(!state.solarWolfBadgeEnabled)}>Solar badge</button>}
            {state.combination.core === 'core_void_falcon' && <button data-testid="void-falcon-badge" aria-pressed={state.voidFalconBadgeEnabled} onClick={() => state.setVoidFalconBadgeEnabled(!state.voidFalconBadgeEnabled)}>Void badge</button>}
            {state.combination.blade === 'blade_storm_fang' && <button data-testid="storm-fang-pattern" aria-pressed={state.stormFangPatternEnabled} onClick={() => state.setStormFangPatternEnabled(!state.stormFangPatternEnabled)}>Storm pattern</button>}
            {state.combination.blade === 'blade_iron_bastion' && <button data-testid="iron-bastion-pattern" aria-pressed={state.ironBastionPatternEnabled} onClick={() => state.setIronBastionPatternEnabled(!state.ironBastionPatternEnabled)}>Bastion pattern</button>}
            {state.combination.blade === 'blade_orbit_halo' && <button data-testid="orbit-halo-pattern" aria-pressed={state.orbitHaloPatternEnabled} onClick={() => state.setOrbitHaloPatternEnabled(!state.orbitHaloPatternEnabled)}>Orbit pattern</button>}
            {state.combination.blade === 'blade_dual_comet' && <button data-testid="dual-comet-pattern" aria-pressed={state.dualCometPatternEnabled} onClick={() => state.setDualCometPatternEnabled(!state.dualCometPatternEnabled)}>Comet pattern</button>}
          </div>
        </div>
        {readoutTarget === 'gear' && <FocusReadout testId="gear-height-readout" phase={focusState.phase} sessionId={focusState.sessionId} activeFramePainted={focusState.activeFramePainted} onPresentationComplete={completeFocusPresentation}>Gear {selectedGear.heightMm.toFixed(1)} mm · total height Δ {(selectedGear.heightMm - lowGearHeight).toFixed(1)} mm vs Low</FocusReadout>}
        {readoutTarget === 'tip' && <FocusReadout testId="tip-contact-readout" phase={focusState.phase} sessionId={focusState.sessionId} activeFramePainted={focusState.activeFramePainted} onPresentationComplete={completeFocusPresentation}>Contact focus · {familyParts.tip.find(part => part.id === state.combination.tip)!.displayName}</FocusReadout>}
        {readoutTarget === 'assist' && <FocusReadout testId="assist-focus-readout" phase={focusState.phase} sessionId={focusState.sessionId} activeFramePainted={focusState.activeFramePainted} onPresentationComplete={completeFocusPresentation}>{selectedAssist.displayName} isolated · Blade transparency reduced</FocusReadout>}
      </section>

      <section className="control-deck">
        <div className="identity-row">
          <div><span className="eyebrow">CURRENT COMBINATION</span><h2>{currentLibraryEntry?.nickname ?? automaticName}</h2>{currentLibraryEntry?.nickname && <span className="automatic-name">{automaticName}</span>}<code data-testid="combination-id">{id}</code></div>
          <button className="primary" data-testid="explode" onClick={() => state.setExploded(!state.exploded)}>{state.exploded ? 'Assemble' : 'Explode'}</button>
        </div>

        <nav className="family-tabs" aria-label="Part families">
          {families.map(family => <button key={family} data-testid={`tab-${family}`} className={state.selectedFamily === family ? 'active' : ''} onClick={() => state.selectFamily(family)}>{familyLabels[family]}</button>)}
        </nav>
        <div className="part-strip" aria-label={`${familyLabels[state.selectedFamily]} choices`}>
          {familyParts[state.selectedFamily].map(part => (
            <button key={part.id} data-testid={`part-${part.id}`} className={state.combination[state.selectedFamily] === part.id ? 'selected' : ''} onClick={() => choosePart(part.id)}>
              <span className="part-icon">{part.displayName.slice(0, 2).toUpperCase()}</span><span>{part.displayName}</span>
            </button>
          ))}
        </div>

        <div className="lower-grid">
          <section className="attributes">
            <div className="section-heading"><h3>Concept attributes</h3><span>0—100</span></div>
            {attributeNames.map(name => <div className="attribute" key={name}><span>{attributeLabels[name]}</span><div><i style={{ width: `${attributes[name]}%` }} /></div><strong>{attributes[name]}</strong></div>)}
            <p data-testid="attribute-disclaimer">Concept attributes for prototype use only.</p>
          </section>
          <section className="actions">
            <h3>Combination tools</h3>
            <div className="action-grid">
              <button data-testid="random" onClick={() => state.replaceCombination(randomCombination())}>Random</button>
              <button data-testid="storm-reset" onClick={state.reset}>Storm Attack</button>
              <button data-testid="save" onClick={() => { state.save(); setNotice('Saved locally.'); }}>Save local</button>
              <button data-testid="restore-local" onClick={() => setNotice(state.restoreSaved() ? 'Saved combination restored.' : 'No valid saved combination.')}>Restore local</button>
              <button data-testid="export" onClick={exportJson}>Export JSON</button>
              <button data-testid="import" onClick={() => importRef.current?.click()}>Import JSON</button>
              <button data-testid="share" onClick={() => setShareOpen(value => !value)}>Share</button>
              <button className="primary" data-testid="enter-arena" onClick={() => window.location.assign(arenaLink)}>Enter Arena</button>
              <button data-testid="export-card" disabled={cardExporting || state.loadState !== 'ready'} onClick={exportCard}>{cardExporting ? 'Rendering card…' : 'Export PNG card'}</button>
              <button data-testid="library" onClick={() => setLibraryOpen(value => !value)}>Library</button>
              <button data-testid="undo" disabled={!state.canUndo || state.loadState !== 'ready'} onClick={() => { beginPartSwitch(); state.undo(); }}>Undo</button>
              <button data-testid="redo" disabled={!state.canRedo || state.loadState !== 'ready'} onClick={() => { beginPartSwitch(); state.redo(); }}>Redo</button>
            </div>
            {shareOpen && (
              <section className="share-panel" aria-label="Share current combination">
                <input data-testid="share-link" aria-label="Combination share link" readOnly value={share.url} onFocus={event => event.currentTarget.select()} />
                <button data-testid="copy-share-link" onClick={async () => {
                  const copied = await copyShareLink(share.url);
                  setNotice(copied ? 'Share link copied.' : 'Clipboard unavailable. Select and copy the link manually.');
                  if (state.testMode) emitUsabilityAction(copied ? { type: 'SHARE_SUCCEEDED', method: 'link' } : { type: 'SYSTEM_ERROR', code: 'SHARE_FAILED' });
                }}>Copy link</button>
                <Suspense fallback={<p>Preparing local QR code…</p>}><QrCodeView content={share.url} onReady={state.testMode ? () => emitUsabilityAction({ type: 'SHARE_SUCCEEDED', method: 'qr' }) : undefined} /></Suspense>
                {share.deviceOnly && <p data-testid="share-device-warning">This local link works only on this device. Configure VITE_SHARE_BASE_URL for a shareable host.</p>}
              </section>
            )}
            {libraryOpen && (
              <section className="library-panel" aria-label="Local combination library">
                <div className="library-editor">
                  <input data-testid="nickname-input" aria-label="Combination nickname" maxLength={60} value={nickname} onChange={event => setNickname(event.target.value)} placeholder="Optional local nickname" />
                  <button data-testid="save-nickname" onClick={() => persistLibrary(setLibraryNickname(library, id, nickname), 'Nickname saved locally.')}>Save nickname</button>
                  <button data-testid="favorite-current" onClick={toggleCurrentFavorite}>{library.favorites.some(entry => entry.id === id) ? 'Unfavorite current' : 'Favorite current'}</button>
                </div>
                <h4>Favorites</h4>
                <div className="library-list">
                  {library.favorites.map(entry => <div key={entry.id}><button data-testid={`favorite-${entry.id}`} onClick={() => restoreFavorite(entry)}>{entry.nickname ?? combinationName(entry.combination)} <code>{entry.id}</code></button><button data-testid={`remove-favorite-${entry.id}`} aria-label={`Remove ${entry.id} favorite`} onClick={() => persistLibrary(removeFavorite(library, entry.id), 'Favorite removed.')}>×</button></div>)}
                  {library.favorites.length === 0 && <p>No favorites yet.</p>}
                </div>
                <h4>Recent</h4>
                <div className="library-list">
                  {library.recent.map(entry => <div key={entry.id}><button data-testid={`recent-${entry.id}`} onClick={() => state.replaceCombination(entry.combination)}>{entry.nickname ?? combinationName(entry.combination)} <code>{entry.id}</code></button></div>)}
                </div>
              </section>
            )}
            <input ref={importRef} data-testid="import-file" hidden type="file" accept="application/json,.json" onChange={event => importJson(event.target.files?.[0])} />
            <p className="notice" role="status">
              {notice}
              {state.startupNotice && notice && (
                <button data-testid="clear-invalid-url" onClick={() => {
                  const clean = new URL(window.location.href);
                  clean.search = state.testMode ? '?test=1' : '';
                  window.history.replaceState(null, '', clean);
                  setNotice('Invalid URL parameters cleared.');
                }}>Clear invalid parameters</button>
              )}
            </p>
          </section>
        </div>
      </section>

      <footer>
        <p>Human visual review remains pending.</p>
        <p>Development continued under a documented provisional internal-prototype decision.</p>
      </footer>
    </main>
  );
}
