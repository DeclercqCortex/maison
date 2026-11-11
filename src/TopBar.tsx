import { useRef } from 'react';
import { emptyProject, type Units } from './model/types';
import { CommitField } from './plan/Inspector';
import { exportProject, importProject } from './store/persistence';
import { useStore, type Mode } from './store/store';

const MODES: { id: Mode; label: string }[] = [
  { id: 'plan', label: 'Plan' },
  { id: 'interior', label: 'Interior' },
  { id: 'exterior', label: 'Exterior' },
];

export function TopBar() {
  const project = useStore((s) => s.project);
  const mode = useStore((s) => s.mode);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const showDimensions = useStore((s) => s.showDimensions);
  const showPreview = useStore((s) => s.showPreview);
  const { commit, undo, redo, setMode, toggleDimensions, togglePreview, loadProject } = useStore.getState();
  const fileInput = useRef<HTMLInputElement>(null);

  const startNew = () => {
    const hasWork = project.floors.some((f) => f.walls.length > 0);
    if (hasWork && !window.confirm('Start a new house? The current plan will be cleared. Save it to a file first if you want to keep it.')) return;
    loadProject(emptyProject());
  };

  const open = async (file: File | undefined) => {
    if (!file) return;
    try {
      loadProject(await importProject(file));
    } catch (err) {
      window.alert(err instanceof SyntaxError ? 'This file could not be read.' : (err as Error).message);
    }
  };

  return (
    <header className="top-bar">
      <div className="brand">Maison</div>
      <CommitField
        className="project-name"
        ariaLabel="House name"
        value={project.name}
        onCommit={(text) => commit((p) => void (p.name = text.trim() || 'My house'))}
      />
      <div className="tabs" role="tablist">
        {MODES.map((m) => (
          <button key={m.id} role="tab" aria-selected={mode === m.id} className={mode === m.id ? 'active' : ''}
            onClick={() => setMode(m.id)}>
            {m.label}
          </button>
        ))}
      </div>
      <div className="spacer" />
      <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">Undo</button>
      <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)">Redo</button>
      {mode === 'plan' && (
        <>
          <label className="check" title="Show a live 3D view of this floor beside the plan">
            <input type="checkbox" checked={showPreview} onChange={togglePreview} />
            3D preview
          </label>
          <label className="check">
            <input type="checkbox" checked={showDimensions} onChange={toggleDimensions} />
            Dimensions
          </label>
        </>
      )}
      <select aria-label="Units" value={project.units}
        onChange={(e) => commit((p) => void (p.units = e.target.value as Units))}>
        <option value="metric">Metres</option>
        <option value="imperial">Feet and inches</option>
      </select>
      <button onClick={startNew}>New</button>
      <button onClick={() => fileInput.current?.click()}>Open</button>
      <button onClick={() => exportProject(project)} title="Save to a file (Ctrl+S)">Save file</button>
      <button onClick={() => useStore.getState().setHelp(true)} title="Guide and keyboard shortcuts (?)">Help</button>
      <input ref={fileInput} type="file" accept=".maison,application/json" hidden
        onChange={(e) => {
          void open(e.target.files?.[0]);
          e.target.value = '';
        }} />
    </header>
  );
}
