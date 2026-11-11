import { useEffect, useMemo, useState } from 'react';
import { thumbnail } from '../catalog/build';
import { CATALOG, CATEGORIES, OUTDOOR_GROUPS } from '../catalog/catalog';
import { formatLength } from '../model/units';
import { useStore } from '../store/store';

const WHERE = { floor: '', wall: 'On a wall', ceiling: 'On the ceiling', surface: 'On furniture' };

/**
 * The furniture catalog (indoors) or garden catalog (outdoors). Click an item,
 * then click in the room or on the lot to place it.
 */
export function CatalogPanel({ outdoor = false }: { outdoor?: boolean }) {
  const placing = useStore((s) => s.placing);
  const units = useStore((s) => s.project.units);
  const setPlacing = useStore((s) => s.setPlacing);
  const [query, setQuery] = useState('');
  /** A category indoors, a group (Trees, Rocks, ...) outdoors, or 'all'. */
  const [filter, setFilter] = useState('all');
  const [pictures, setPictures] = useState<Record<string, string>>({});

  const chips = outdoor ? OUTDOOR_GROUPS.map((g) => ({ id: g, label: g })) : CATEGORIES;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CATALOG.filter(
      (c) =>
        (c.category === 'outdoor') === outdoor &&
        (filter === 'all' || (outdoor ? c.group : c.category) === filter) &&
        (!q || c.name.toLowerCase().includes(q)),
    );
  }, [query, filter, outdoor]);

  // Pictures are drawn only for what is listed, a few at a time, so the panel appears straight away.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const done: Record<string, string> = {};
      for (let i = 0; i < shown.length && !cancelled; i++) {
        done[shown[i].id] = await thumbnail(shown[i]);
        if (i % 8 === 7 || i === shown.length - 1) {
          if (!cancelled) setPictures((prev) => ({ ...prev, ...done }));
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shown]);

  const label = outdoor ? 'Search the garden catalog' : 'Search furniture';
  return (
    <aside className="catalog">
      <input className="search" type="search" placeholder={label} aria-label={label}
        value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="chips">
        <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All</button>
        {chips.map((c) => (
          <button key={c.id} className={filter === c.id ? 'active' : ''} onClick={() => setFilter(c.id)}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="count">{shown.length} {shown.length === 1 ? 'piece' : 'pieces'}</div>
      <div className="catalog-grid">
        {shown.map((c) => (
          <button key={c.id} className={placing === c.id ? 'card active' : 'card'} aria-pressed={placing === c.id}
            title={`${c.name} · ${formatLength(c.size.w, units)} wide, ${formatLength(c.size.d, units)} deep, ${formatLength(c.size.h, units)} high`}
            onClick={() => setPlacing(placing === c.id ? null : c.id)}>
            {pictures[c.id] ? <img src={pictures[c.id]} alt="" loading="lazy" /> : <span className="no-picture" />}
            <span className="name">{c.name}</span>
            {WHERE[c.placement] && <span className="where">{WHERE[c.placement]}</span>}
          </button>
        ))}
        {shown.length === 0 && <p className="muted">Nothing matches “{query}”.</p>}
      </div>
    </aside>
  );
}
