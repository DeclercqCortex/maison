import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { apartmentProject } from './model/apartment';
import { sampleProject } from './model/sample';
import { emptyProject, MAX_STOREYS, type Project } from './model/types';
import {
  createProject,
  deleteProject,
  duplicateProject,
  importProject,
  listProjects,
  openProject,
  type ProjectSummary,
} from './store/persistence';

const timeAgo = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
function edited(when: number): string {
  const seconds = (when - Date.now()) / 1000;
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [unit, size] of steps) if (Math.abs(seconds) >= size) return timeAgo.format(Math.round(seconds / size), unit);
  return 'just now';
}

function describe(p: ProjectSummary): string {
  const parts =
    p.kind === 'apartment'
      ? [`Floor ${p.aptFloor} of ${p.storeys}`]
      : [`${p.floors} ${p.floors === 1 ? 'floor' : 'floors'}`];
  if (p.pieces) parts.push(`${p.pieces} ${p.pieces === 1 ? 'piece' : 'pieces'} placed`);
  return parts.join(' · ');
}

/** A line drawing of a house beside a tall apartment block, drawn on as the screen opens. */
function Drawing() {
  return (
    <svg className="home-drawing" viewBox="0 0 420 220" aria-hidden="true">
      <g className="ink">
        {/* The house: walls, roof, door and windows. */}
        <path pathLength={1} d="M30 200 V120 L95 70 L160 120 V200 Z" />
        <path pathLength={1} d="M18 128 L95 64 L172 128" />
        <path pathLength={1} d="M82 200 V160 H108 V200" />
        <path pathLength={1} d="M44 132 H70 V152 H44 Z M120 132 H146 V152 H120 Z" />
        {/* The apartment block, its floors and balconies. */}
        <path pathLength={1} d="M230 200 V30 H360 V200" />
        <path pathLength={1} d="M230 64 H360 M230 98 H360 M230 132 H360 M230 166 H360" />
        <path pathLength={1} d="M250 40 h20 v14 h-20 z M285 40 h20 v14 h-20 z M320 40 h20 v14 h-20 z" />
        <path pathLength={1} d="M250 74 h20 v14 h-20 z M285 74 h20 v14 h-20 z M320 74 h20 v14 h-20 z" />
        <path pathLength={1} d="M250 108 h20 v14 h-20 z M285 108 h20 v14 h-20 z M320 108 h20 v14 h-20 z" />
        <path pathLength={1} d="M250 142 h20 v14 h-20 z M285 142 h20 v14 h-20 z M320 142 h20 v14 h-20 z" />
        <path pathLength={1} d="M278 200 V178 H312 V200" />
        <path pathLength={1} d="M360 90 H376 V106 H360 M360 124 H376 V140 H360 M360 56 H376 V72 H360" />
        {/* Ground and grass. */}
        <path pathLength={1} d="M0 200 H420" />
        <path pathLength={1} d="M190 200 q4 -10 8 0 q4 -12 8 0 M385 200 q4 -10 8 0 q4 -12 8 0" />
      </g>
    </svg>
  );
}

/** The plan sketch shown on a project's card. */
function Sketch({ path }: { path: string }) {
  return (
    <svg className="sketch" viewBox="0 0 100 70" aria-hidden="true">
      {path ? <path d={path} /> : <text x="50" y="38" textAnchor="middle">Empty plan</text>}
    </svg>
  );
}

/** Choosing the building for a new apartment: how tall it is and which floor the flat is on. */
function NewApartment({ onCancel, onCreate }: { onCancel(): void; onCreate(project: Project): void }) {
  const [name, setName] = useState('My apartment');
  const [storeys, setStoreys] = useState(12);
  const [floor, setFloor] = useState(8);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => dialog.current?.showModal(), []);
  const setHeight = (n: number) => {
    const s = Math.max(1, Math.min(MAX_STOREYS, Math.round(n) || 1));
    setStoreys(s);
    setFloor((f) => Math.min(f, s));
  };
  return (
    <dialog ref={dialog} className="new-apartment" onClose={onCancel} aria-labelledby="new-apartment-title">
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          onCreate(apartmentProject(name.trim() || 'My apartment', { storeys, floor, unitsPerFloor: 3 }));
        }}
      >
        <h2 id="new-apartment-title">New apartment</h2>
        <p className="muted">One flat in an apartment building, with a balcony to decorate. You can change all of this later.</p>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Floors in the building
          <div className="storeys">
            <input type="range" min="1" max={MAX_STOREYS} value={storeys} onChange={(e) => setHeight(Number(e.target.value))} />
            <input type="number" min="1" max={MAX_STOREYS} value={storeys} aria-label="Floors in the building"
              onChange={(e) => setHeight(Number(e.target.value))} />
          </div>
        </label>
        <label>
          Your apartment is on floor
          <select value={floor} onChange={(e) => setFloor(Number(e.target.value))}>
            {Array.from({ length: storeys }, (_, i) => (
              <option key={i} value={i + 1}>{i === 0 ? '1 (ground floor)' : i + 1}</option>
            ))}
          </select>
        </label>
        {/* A small picture of the building, with the chosen floor picked out. */}
        <div className="mini-tower" aria-hidden="true">
          {Array.from({ length: storeys }, (_, i) => (
            <span key={i} className={storeys - i === floor ? 'mine' : ''} />
          ))}
        </div>
        <div className="actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="submit" className="primary">Create apartment</button>
        </div>
      </form>
    </dialog>
  );
}

/** The start screen: start a house or an apartment, or carry on with a saved project. */
export function Home() {
  const [projects, setProjects] = useState(listProjects);
  const [askApartment, setAskApartment] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  /** Fades the screen out, then does what was chosen. */
  const leave = (then: () => void) => {
    setLeaving(true);
    window.setTimeout(then, 220);
  };
  const create = (project: Project) => leave(() => createProject(project));
  const open = (id: string) =>
    leave(() => {
      if (!openProject(id)) {
        setLeaving(false);
        window.alert('This project could not be opened.');
        setProjects(listProjects());
      }
    });
  const remove = (p: ProjectSummary) => {
    if (!window.confirm(`Delete “${p.name}”? This cannot be undone. Save it to a file first if you might want it later.`)) return;
    deleteProject(p.id);
    setProjects(listProjects());
  };
  const duplicate = (p: ProjectSummary) => {
    duplicateProject(p.id);
    setProjects(listProjects());
  };
  const openFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      create(await importProject(file));
    } catch (err) {
      window.alert(err instanceof SyntaxError ? 'This file could not be read.' : (err as Error).message);
    }
  };

  return (
    <div className={leaving ? 'home leaving' : 'home'}>
      <div className="home-inner">
        <header className="home-hero">
          <div>
            <h1>Maison</h1>
            <p>Draw a plan on paper, furnish it in 3D, and see it standing in the world.</p>
          </div>
          <Drawing />
        </header>

        <section className="home-start" aria-label="Start something new">
          <button className="start-card" style={{ '--i': 0 } as CSSProperties} onClick={() => create(emptyProject())}>
            <span className="start-icon house" aria-hidden="true" />
            <strong>New house</strong>
            <span>A house of your own, on a plot of rural grassland sized in acres.</span>
          </button>
          <button className="start-card" style={{ '--i': 1 } as CSSProperties} onClick={() => setAskApartment(true)}>
            <span className="start-icon apartment" aria-hidden="true" />
            <strong>New apartment</strong>
            <span>A flat with a balcony, in a building of 1 to {MAX_STOREYS} floors.</span>
          </button>
          <div className="start-more" style={{ '--i': 2 } as CSSProperties}>
            <button onClick={() => create(sampleProject())}>Open the example house</button>
            <button onClick={() => fileInput.current?.click()}>Open a .maison file</button>
          </div>
        </section>

        <section className="home-projects">
          <h2>Your projects</h2>
          {projects.length === 0 ? (
            <p className="muted">Nothing yet. What you make is saved in this browser as you go, and will be listed here.</p>
          ) : (
            <div className="project-grid">
              {projects.map((p, i) => (
                <article key={p.id} className="project-card" style={{ '--i': i + 3 } as CSSProperties}>
                  <button className="project-open" onClick={() => open(p.id)} title={`Open ${p.name}`}>
                    <Sketch path={p.sketch} />
                    <span className="project-text">
                      <span className={`kind ${p.kind}`}>{p.kind === 'apartment' ? 'Apartment' : 'House'}</span>
                      <strong>{p.name}</strong>
                      <span className="muted">{describe(p)}</span>
                      <span className="muted">Edited {edited(p.updated)}</span>
                    </span>
                  </button>
                  <div className="project-actions">
                    <button onClick={() => duplicate(p)} title="Make a copy">Copy</button>
                    <button className="danger" onClick={() => remove(p)} title="Delete this project">Delete</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
      {askApartment && <NewApartment onCancel={() => setAskApartment(false)} onCreate={create} />}
      <input ref={fileInput} type="file" accept=".maison,application/json" hidden
        onChange={(e) => {
          void openFile(e.target.files?.[0]);
          e.target.value = '';
        }} />
    </div>
  );
}
