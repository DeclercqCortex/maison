import { create } from 'zustand';
import { produce } from 'immer';
import { recomputeElevations, tidyFloor } from '../model/floors';
import { emptyProject, type FeatureType, type Floor, type OpeningType, type Project, type Vec2 } from '../model/types';

export type Mode = 'plan' | 'interior' | 'exterior';
/** The start screen with the list of projects, or the editor with one of them open. */
export type Screen = 'home' | 'editor';
export type Tool = 'select' | 'wall' | 'rect' | OpeningType | FeatureType | 'erase';
export type Selection =
  | { kind: 'wall'; id: string }
  | { kind: 'opening'; id: string }
  | { kind: 'feature'; id: string }
  | { kind: 'item'; id: string }
  | { kind: 'room'; at: Vec2 }
  | null;

const HISTORY_LIMIT = 200;

interface State {
  screen: Screen;
  /** Where the open project is saved in this browser's project list; null before one is opened. */
  projectId: string | null;
  project: Project;
  past: Project[];
  future: Project[];
  activeFloorId: string;
  mode: Mode;
  tool: Tool;
  selection: Selection;
  showDimensions: boolean;
  /** Show a live 3D view of the floor beside the plan. */
  showPreview: boolean;
  togglePreview(): void;
  /** Catalog id of the furniture being placed in the Interior view, if any. */
  placing: string | null;
  setPlacing(catalogId: string | null): void;
  /** First-person walk-through in the Interior view. */
  walk: boolean;
  setWalk(walk: boolean): void;
  /** Lighter graphics for slower computers: less grass, softer shadows, lower sharpness. */
  lite: boolean;
  setLite(lite: boolean): void;
  /** The welcome and shortcuts guide. */
  help: boolean;
  setHelp(help: boolean): void;
  /** Counts whole-project replacements, so views can re-frame when a different house is opened. */
  loads: number;

  setMode(mode: Mode): void;
  setTool(tool: Tool): void;
  setActiveFloor(id: string): void;
  select(selection: Selection): void;
  toggleDimensions(): void;

  /** Apply a change as one undo step. */
  commit(recipe: (project: Project) => void): void;
  /** Start a drag: records one undo step that the following transient() calls belong to. */
  beginTransient(): void;
  /** Apply a change without adding an undo step. */
  transient(recipe: (project: Project) => void): void;
  undo(): void;
  redo(): void;
  /** Replace the whole project (open a file, start a new one). Clears history. */
  loadProject(project: Project): void;
  /** Open a saved project in the editor. */
  openEditor(id: string, project: Project): void;
  showHome(): void;
}

/** Runs a change, then restores the invariants every change must keep. */
const apply = (project: Project, recipe: (project: Project) => void): Project =>
  produce(project, (draft) => {
    recipe(draft);
    draft.floors.forEach(tidyFloor);
    recomputeElevations(draft);
  });

const groundFloorId = (project: Project): string =>
  (project.floors.find((f) => f.level === 0) ?? project.floors[0]).id;

export const useStore = create<State>((set, get) => {
  const initial = emptyProject();
  return {
    screen: 'home',
    projectId: null,
    project: initial,
    past: [],
    future: [],
    activeFloorId: groundFloorId(initial),
    mode: 'plan',
    tool: 'wall',
    selection: null,
    showDimensions: true,
    showPreview: false,
    togglePreview: () => set((s) => ({ showPreview: !s.showPreview })),
    placing: null,
    setPlacing: (placing) => set({ placing, selection: null }),
    walk: false,
    setWalk: (walk) => set({ walk, placing: null, selection: null }),
    lite: false,
    setLite: (lite) => set({ lite }),
    help: false,
    setHelp: (help) => set({ help }),
    loads: 0,

    // Each view has its own kinds of selection, so nothing stays selected across a switch.
    setMode: (mode) => set({ mode, selection: null, placing: null, walk: false }),
    setTool: (tool) => set({ tool, selection: null }),
    setActiveFloor: (id) => set({ activeFloorId: id, selection: null, walk: false }),
    select: (selection) => set({ selection }),
    toggleDimensions: () => set((s) => ({ showDimensions: !s.showDimensions })),

    commit: (recipe) => {
      const { project, past } = get();
      const next = apply(project, recipe);
      if (next === project) return;
      set({ project: next, past: [...past, project].slice(-HISTORY_LIMIT), future: [] });
    },
    beginTransient: () => {
      const { project, past } = get();
      set({ past: [...past, project].slice(-HISTORY_LIMIT), future: [] });
    },
    transient: (recipe) => set((s) => ({ project: apply(s.project, recipe) })),
    undo: () => {
      const { project, past, future } = get();
      if (!past.length) return;
      set({ project: past[past.length - 1], past: past.slice(0, -1), future: [project, ...future], selection: null });
    },
    redo: () => {
      const { project, past, future } = get();
      if (!future.length) return;
      set({ project: future[0], past: [...past, project], future: future.slice(1), selection: null });
    },
    loadProject: (loaded) => {
      const project = apply(loaded, () => {});
      set((s) => ({
        project, past: [], future: [], activeFloorId: groundFloorId(project), selection: null, loads: s.loads + 1,
      }));
    },
    openEditor: (id, loaded) => {
      get().loadProject(loaded);
      set({ projectId: id, screen: 'editor', mode: 'plan', tool: 'select', placing: null, walk: false });
    },
    showHome: () => set({ screen: 'home', selection: null, placing: null, walk: false, help: false }),
  };
});

/** The floor being edited, from either a draft (inside a recipe) or a snapshot. */
export function activeFloor(project: Project, floorId: string): Floor {
  return project.floors.find((f) => f.id === floorId) ?? project.floors.find((f) => f.level === 0) ?? project.floors[0];
}

export function useActiveFloor(): Floor {
  return useStore((s) => activeFloor(s.project, s.activeFloorId));
}
