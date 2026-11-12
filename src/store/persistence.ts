import { migrateProject, uid, type Project, type ProjectKind } from '../model/types';
import { useStore } from './store';

/**
 * Projects are kept in this browser's localStorage, one entry per project plus
 * a small index for the start screen. localStorage rather than IndexedDB
 * because its writes are synchronous: a save made while the page is closing is
 * guaranteed to land. A plan is a few kilobytes of JSON, far below the limit.
 */
const INDEX = 'maison.projects';
const projectKey = (id: string) => `maison.project.${id}`;
/** Where the single autosaved project lived before there was a project list. */
const LEGACY = 'maison.project';
/** The project open in this tab (sessionStorage), so a reload returns to it. */
const OPEN = 'maison.open';

/** What the start screen shows about a project without reading all of it. */
export interface ProjectSummary {
  id: string;
  name: string;
  kind: ProjectKind;
  /** Last change, in milliseconds since 1970. */
  updated: number;
  floors: number;
  rooms: number;
  pieces: number;
  storeys?: number;
  aptFloor?: number;
  /** A small drawing of the walls: SVG path data in a 100 × 70 box. */
  sketch: string;
}

/** Path data drawing the walls of the floor with the most walls, fitted into a 100 × 70 box. */
export function sketchOf(project: Project): string {
  const floor = project.floors.reduce((a, b) => (b.walls.length > a.walls.length ? b : a));
  const pts = floor.walls.flatMap((w) => [w.a, w.b]);
  if (!pts.length) return '';
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const [minX, minY] = [Math.min(...xs), Math.min(...ys)];
  const span = Math.max(Math.max(...xs) - minX, (Math.max(...ys) - minY) * (100 / 70), 1);
  const k = 84 / span;
  const ox = (100 - (Math.max(...xs) - minX) * k) / 2;
  const oy = (70 - (Math.max(...ys) - minY) * k) / 2;
  const f = (v: number) => +v.toFixed(1);
  return floor.walls
    .map((w) => `M${f(ox + (w.a.x - minX) * k)} ${f(oy + (w.a.y - minY) * k)}L${f(ox + (w.b.x - minX) * k)} ${f(oy + (w.b.y - minY) * k)}`)
    .join('');
}

function summarise(id: string, project: Project, updated: number): ProjectSummary {
  return {
    id,
    name: project.name,
    kind: project.kind,
    updated,
    floors: project.floors.length,
    rooms: project.floors.reduce((n, f) => n + f.labels.length, 0),
    pieces: project.floors.reduce((n, f) => n + f.items.length, 0) + project.outdoor.length,
    ...(project.building ? { storeys: project.building.storeys, aptFloor: project.building.floor } : {}),
    sketch: sketchOf(project),
  };
}

function readIndex(): ProjectSummary[] {
  try {
    const list = JSON.parse(localStorage.getItem(INDEX) ?? '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
const writeIndex = (list: ProjectSummary[]) => localStorage.setItem(INDEX, JSON.stringify(list));

/** Every saved project, most recently changed first. */
export function listProjects(): ProjectSummary[] {
  return readIndex().sort((a, b) => b.updated - a.updated);
}

export function readProject(id: string): Project | null {
  try {
    const text = localStorage.getItem(projectKey(id));
    return text ? migrateProject(JSON.parse(text)) : null;
  } catch {
    return null;
  }
}

/** Saves a project under its id and brings its entry in the list up to date. */
export function writeProject(id: string, project: Project, updated = Date.now()): void {
  localStorage.setItem(projectKey(id), JSON.stringify(project));
  writeIndex([...readIndex().filter((p) => p.id !== id), summarise(id, project, updated)]);
}

export function deleteProject(id: string): void {
  localStorage.removeItem(projectKey(id));
  writeIndex(readIndex().filter((p) => p.id !== id));
}

/** Saves a copy under a new id, named "… copy". Returns the new id. */
export function duplicateProject(id: string): string | null {
  const project = readProject(id);
  if (!project) return null;
  const copy = uid();
  writeProject(copy, { ...project, name: `${project.name} copy` });
  return copy;
}

/** Adds a project to the list and opens it in the editor. */
export function createProject(project: Project): void {
  const id = uid();
  try {
    writeProject(id, project);
  } catch (err) {
    console.warn('Could not save the new project', err);
  }
  useStore.getState().openEditor(id, project);
}

export function openProject(id: string): boolean {
  const project = readProject(id);
  if (!project) return false;
  useStore.getState().openEditor(id, project);
  return true;
}

/** Writes any change not saved yet. Set up by startAutosave. */
let flush: () => void = () => {};

/** Saves the open project, then shows the start screen. */
export function goHome(): void {
  flush();
  useStore.getState().showHome();
}

/** Moves a project autosaved before the project list existed into the list. */
function adoptLegacy(): void {
  const text = localStorage.getItem(LEGACY);
  if (!text) return;
  const project = migrateProject(JSON.parse(text));
  if (project && !readIndex().length) writeProject(uid(), project);
  localStorage.removeItem(LEGACY);
}

/** Autosaves every change to the open project. */
export function startAutosave(): void {
  try {
    adoptLegacy();
  } catch (err) {
    console.warn('Could not bring over the previously saved project', err);
  }
  let timer: number | undefined;
  let dirty = false;
  flush = () => {
    window.clearTimeout(timer);
    if (!dirty) return;
    dirty = false;
    const { projectId, project } = useStore.getState();
    if (!projectId) return;
    try {
      writeProject(projectId, project);
    } catch (err) {
      console.warn('Autosave failed', err);
    }
  };
  // Reloading the page goes back to the project that was open; a new visit starts on the start screen.
  try {
    const open = sessionStorage.getItem(OPEN);
    if (open) openProject(open);
  } catch {
    // No session storage: start on the start screen.
  }
  useStore.subscribe((state, prev) => {
    if (state.screen !== prev.screen || state.projectId !== prev.projectId) {
      try {
        if (state.screen === 'editor' && state.projectId) sessionStorage.setItem(OPEN, state.projectId);
        else sessionStorage.removeItem(OPEN);
      } catch {
        // Not remembered; a reload will show the start screen.
      }
    }
    // Opening a project is not a change to it.
    if (state.project === prev.project || state.loads !== prev.loads) return;
    dirty = true;
    window.clearTimeout(timer);
    timer = window.setTimeout(flush, 150);
  });
  // Save straight away when the page is being hidden or closed, so the last change is not lost.
  window.addEventListener('pagehide', () => flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}

/** A safe file name made from the house's name. */
export const fileStem = (project: Project): string => project.name.replace(/[^\w\- ]+/g, '').trim() || 'house';

/** Hands a file to the browser to save. `source` is the file's contents or a data URL. */
export function saveFile(name: string, source: Blob | string): void {
  const url = typeof source === 'string' ? source : URL.createObjectURL(source);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  if (typeof source !== 'string') URL.revokeObjectURL(url);
}

export function exportProject(project: Project): void {
  saveFile(`${fileStem(project)}.maison`, new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }));
}

const WELCOMED = 'maison.welcomed';
/** Whether this browser has opened Maison before (so the welcome guide is only shown once). */
export function hasBeenWelcomed(): boolean {
  try {
    return localStorage.getItem(WELCOMED) === '1' || readIndex().length > 1;
  } catch {
    return true;
  }
}
export function markWelcomed(): void {
  try {
    localStorage.setItem(WELCOMED, '1');
  } catch {
    // Storage is unavailable; the guide will simply show again next time.
  }
}

/** Reads a .maison file. Throws if the file is not a valid project. */
export async function importProject(file: File): Promise<Project> {
  const project = migrateProject(JSON.parse(await file.text()));
  if (!project) throw new Error('This file is not a Maison project.');
  return project;
}
