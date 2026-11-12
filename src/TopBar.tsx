import { useRef } from 'react';
import type { Units } from './model/types';
import { CommitField } from './plan/Inspector';
import { createProject, exportProject, goHome, importProject } from './store/persistence';
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
  const { commit, undo, redo, setMode, toggleDimensions, togglePreview } = useStore.getState();
  const fileInput = useRef<HTMLInputElement>(null);
  const fallbackName = project.kind === 'apartment' ? 'My apartment' : 'My house';

  // An opened file becomes a project of its own; the current one stays in the project list.
  const open = async (file: File | undefined) => {
    if (!file) return;
    try {
      createProject(await importProject(file));
    } catch (err) {
      window.alert(err instanceof SyntaxError ? 'This file could not be read.' : (err as Error).message);
    }
  };

  return (
    <header className="top-bar">
      <button className="brand" onClick={goHome} title="Back to your projects">Maison</button>
      <CommitField
        className="project-name"
        ariaLabel={project.kind === 'apartment' ? 'Apartment name' : 'House name'}
        value={project.name}
        onCommit={(text) => commit((p) => void (p.name = text.trim() || fallbackName))}
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
      <button onClick={goHome} title="Your projects, and starting a new house or apartment">Projects</button>
      <button onClick={() => fileInput.current?.click()}>Open file</button>
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
