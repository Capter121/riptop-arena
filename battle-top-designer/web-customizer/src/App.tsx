import { Component, type ErrorInfo, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { conceptAttributes, attributeNames } from './attributes';
import {
  combinationId, combinationName, enumerateCombinations, families, familyParts, parseCombinationJson,
  randomCombination, serializeCombination, type Family,
} from './domain';
import { CustomizerScene } from './Scene';
import { captureScene } from './diagnostics';
import { beginPartSwitch, markOnce } from './performance/marks';
import { createShareLink } from './sharing/combinationUrl';
import { renderCombinationCard } from './sharing/cardRenderer';
import { QrCodeView } from './sharing/QrCodeView';
import { copyShareLink } from './sharing/shareLink';
import { currentSnapshot, useCustomizer } from './store';
import './styles.css';

const familyLabels: Record<Family, string> = {
  core: 'Core', blade: 'Main Blade', assist: 'Assist Ring', gear: 'Height Gear', tip: 'Performance Tip',
};

class SceneErrorBoundary extends Component<{ resetKey: string; children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    useCustomizer.getState().setLoadState('error', error.message);
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
  const importRef = useRef<HTMLInputElement>(null);
  const focusTimer = useRef<number | null>(null);
  const id = combinationId(state.combination);
  const attributes = useMemo(() => conceptAttributes(state.combination), [state.combination]);
  const selectedGear = familyParts.gear.find(part => part.id === state.combination.gear)!;
  const lowGearHeight = familyParts.gear.find(part => part.id === 'gear_low')!.heightMm;
  const share = useMemo(() => createShareLink(
    state.combination,
    new URL(window.location.href),
    import.meta.env.VITE_SHARE_BASE_URL,
  ), [state.combination]);

  useEffect(() => {
    markOnce('phase3b:shell-ready');
    (window as any).__NSS_CUSTOMIZER__ = {
      snapshot: currentSnapshot,
      restore: () => useCustomizer.getState().restorePresentation(),
      enumerateIds: () => enumerateCombinations().map(combinationId),
      selectBladeForDiagnostics: (partId: string) => {
        beginPartSwitch();
        useCustomizer.getState().selectFamily('blade');
        useCustomizer.getState().selectPart(partId);
      },
    };
    return () => { if (focusTimer.current !== null) window.clearTimeout(focusTimer.current); };
  }, []);

  const choosePart = (partId: string) => {
    if (focusTimer.current !== null) window.clearTimeout(focusTimer.current);
    beginPartSwitch();
    state.selectPart(partId);
    const family = state.selectedFamily;
    if (family === 'assist' || family === 'gear' || family === 'tip') {
      focusTimer.current = window.setTimeout(() => {
        useCustomizer.getState().restorePresentation();
        focusTimer.current = null;
      }, 900);
    }
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
    } catch (error) {
      setNotice(error instanceof Error ? `Card export failed: ${error.message} Retry when the model is ready.` : 'Card export failed. Retry when the model is ready.');
    } finally {
      setCardExporting(false);
    }
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div><span className="eyebrow">NOVA SPIN SYSTEM</span><h1>Internal Customizer</h1></div>
        <span className="prototype-badge">PROVISIONAL PROTOTYPE</span>
      </header>

      <section className="viewer" aria-label="3D customizer viewport">
        <SceneErrorBoundary resetKey={id}><CustomizerScene combination={state.combination} /></SceneErrorBoundary>
        <div className={`load-status ${state.loadState}`} data-testid="load-status" data-state={state.loadState}>
          {state.loadState === 'loading' ? 'Loading local GLB…' : state.loadState === 'error' ? state.error : 'Offline model ready'}
        </div>
        <div className="viewer-tools" aria-label="Camera controls">
          {(['top', 'perspective', 'side', 'bottom'] as const).map(preset => (
            <button key={preset} data-testid={`camera-${preset}`} className={state.cameraPreset === preset ? 'active' : ''} onClick={() => state.setCamera(preset)}>{preset === 'perspective' ? '45°' : preset}</button>
          ))}
          <button data-testid="reset-view" onClick={state.restorePresentation}>Reset</button>
          <button data-testid="debug-axis" aria-pressed={state.debugAxis} onClick={() => state.setDebugAxis(!state.debugAxis)}>Axis</button>
        </div>
        {state.focus === 'gear' && <div className="focus-readout" data-testid="gear-height-readout">Gear {selectedGear.heightMm.toFixed(1)} mm · total height Δ {(selectedGear.heightMm - lowGearHeight).toFixed(1)} mm vs Low</div>}
        {state.focus === 'tip' && <div className="focus-readout" data-testid="tip-contact-readout">Contact focus · {familyParts.tip.find(part => part.id === state.combination.tip)!.displayName}</div>}
        {state.focus === 'assist' && <div className="focus-readout" data-testid="assist-focus-readout">Assist isolated · Blade transparency reduced</div>}
      </section>

      <section className="control-deck">
        <div className="identity-row">
          <div><span className="eyebrow">CURRENT COMBINATION</span><h2>{combinationName(state.combination)}</h2><code data-testid="combination-id">{id}</code></div>
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
            {attributeNames.map(name => <div className="attribute" key={name}><span>{name}</span><div><i style={{ width: `${attributes[name]}%` }} /></div><strong>{attributes[name]}</strong></div>)}
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
              <button data-testid="export-card" disabled={cardExporting || state.loadState !== 'ready'} onClick={exportCard}>{cardExporting ? 'Rendering card…' : 'Export PNG card'}</button>
            </div>
            {shareOpen && (
              <section className="share-panel" aria-label="Share current combination">
                <input data-testid="share-link" aria-label="Combination share link" readOnly value={share.url} onFocus={event => event.currentTarget.select()} />
                <button data-testid="copy-share-link" onClick={async () => {
                  const copied = await copyShareLink(share.url);
                  setNotice(copied ? 'Share link copied.' : 'Clipboard unavailable. Select and copy the link manually.');
                }}>Copy link</button>
                <QrCodeView content={share.url} />
                {share.deviceOnly && <p data-testid="share-device-warning">This local link works only on this device. Configure VITE_SHARE_BASE_URL for a shareable host.</p>}
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
