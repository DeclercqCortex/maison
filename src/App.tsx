import { lazy, Suspense, useEffect } from 'react';
import { Help } from './Help';
import { Home } from './Home';
import { TopBar } from './TopBar';
import { exportProject, hasBeenWelcomed } from './store/persistence';
import { ExteriorPanel } from './exterior/ExteriorPanel';
import { CatalogPanel } from './interior/CatalogPanel';
import { DecorPanel } from './interior/DecorPanel';
import { Inspector } from './plan/Inspector';
import { PlanEditor } from './plan/PlanEditor';
import { ToolRail } from './plan/ToolRail';
import { useStore } from './store/store';
import { SceneBoundary } from './three/SceneBoundary';

const Scene3D = lazy(() => import('./three/Scene3D'));
const loading = <div className="loading">Loading 3D view…</div>;

export function App() {
  const screen = useStore((s) => s.screen);
  return screen === 'home' ? <Home /> : <Editor />;
}

function Editor() {
  const mode = useStore((s) => s.mode);
  const showPreview = useStore((s) => s.showPreview);
  const walk = useStore((s) => s.walk);

  // Side panels appearing or disappearing change the 3D view's size; nudge it to re-measure.
  useEffect(() => {
    window.dispatchEvent(new Event('resize'));
  }, [mode, walk, showPreview]);

  // Show the guide the first time a project is opened in this browser.
  useEffect(() => {
    if (!hasBeenWelcomed()) useStore.getState().setHelp(true);
  }, []);

  // Shortcuts that work in every view. Each view's own shortcuts run first and can claim a key.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || (e.target as HTMLElement).matches?.('input, select, textarea')) return;
      const st = useStore.getState();
      if (st.help) return;
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === 's') {
        e.preventDefault();
        exportProject(st.project);
      } else if (e.ctrlKey || e.metaKey || e.altKey) return;
      else if (key === '1') st.setMode('plan');
      else if (key === '2') st.setMode('interior');
      else if (key === '3') st.setMode('exterior');
      else if (key === '?') st.setHelp(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="app">
      <Help />
      <TopBar />
      {mode === 'plan' ? (
        <main className="plan">
          <ToolRail />
          <PlanEditor />
          {showPreview && (
            <div className="preview-pane">
              <SceneBoundary>
                <Suspense fallback={loading}>
                  <Scene3D mode="interior" compact />
                </Suspense>
              </SceneBoundary>
            </div>
          )}
          <Inspector />
        </main>
      ) : (
        <main className="three">
          {mode === 'interior' && !walk && <CatalogPanel />}
          {mode === 'exterior' && <CatalogPanel outdoor />}
          <div className="scene-wrap">
            <SceneBoundary key={mode}>
              <Suspense fallback={loading}>
                <Scene3D mode={mode} />
              </Suspense>
            </SceneBoundary>
          </div>
          {mode === 'interior' && !walk && <DecorPanel />}
          {mode === 'exterior' && <ExteriorPanel />}
        </main>
      )}
    </div>
  );
}
