import { addFloor } from '../model/floors';
import { useActiveFloor, useStore } from '../store/store';

/** Floating list of floors, top floor first, with buttons to add one above or below. */
export function FloorSwitcher() {
  const floors = useStore((s) => s.project.floors);
  const active = useActiveFloor();
  const { commit, setActiveFloor } = useStore.getState();
  const ordered = [...floors].sort((a, b) => b.level - a.level);

  const add = (where: 'above' | 'below') => {
    let id = '';
    commit((p) => {
      id = addFloor(p, where);
    });
    if (id) setActiveFloor(id);
  };

  return (
    <div className="floor-switcher" aria-label="Floors">
      <button className="add" title="Add a floor on top" onClick={() => add('above')}>+ Floor above</button>
      {ordered.map((f) => (
        <button key={f.id} className={f.id === active.id ? 'floor active' : 'floor'} aria-pressed={f.id === active.id}
          onClick={() => setActiveFloor(f.id)}>
          {f.name}
        </button>
      ))}
      <button className="add" title="Add a floor underneath" onClick={() => add('below')}>+ Floor below</button>
    </div>
  );
}
