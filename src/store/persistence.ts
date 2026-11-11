import { migrateProject, type Project } from '../model/types';
import { useStore } from './store';

/**
 * Autosave uses localStorage rather than IndexedDB because its writes are
 * synchronous: a save made while the page is closing is guaranteed to land.
 * A plan is a few kilobytes of JSON, far below the storage limit.
 */
const KEY = 'maison.project';

function readSaved(): Project | null {
  const text = localStorage.getItem(KEY);
  if (!text) return null;
  return migrateProject(JSON.parse(text));
}

/** Restores the last autosaved project, then autosaves every later change. */
export function startAutosave(): void {
  try {
    const saved = readSaved();
    if (saved) useStore.getState().loadProject(saved);
  } catch (err) {
    console.warn('Could not restore the autosaved project', err);
  }
  let timer: number | undefined;
  let dirty = false;
  const flush = () => {
    window.clearTimeout(timer);
    if (!dirty) return;
    dirty = false;
    try {
      localStorage.setItem(KEY, JSON.stringify(useStore.getState().project));
    } catch (err) {
      console.warn('Autosave failed', err);
    }
  };
  useStore.subscribe((state, prev) => {
    if (state.project === prev.project) return;
    dirty = true;
    window.clearTimeout(timer);
    timer = window.setTimeout(flush, 150);
  });
  // Save straight away when the page is being hidden or closed, so the last change is not lost.
  window.addEventListener('pagehide', flush);
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
    return localStorage.getItem(WELCOMED) === '1' || localStorage.getItem(KEY) !== null;
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
