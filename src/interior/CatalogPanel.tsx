import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { thumbnail } from '../catalog/build';
import { CATEGORIES, OUTDOOR_GROUPS, type CatalogItem } from '../catalog/catalog';
import { removeCustomModel } from '../catalog/custom';
import type { FurnitureStyle } from '../catalog/kinds';
import { hasCounterpart } from '../catalog/style';
import { useCatalog } from '../catalog/useCatalog';
import { QUICK_SEARCHES, searchCatalog, textScore } from '../catalog/search';
import { onlineModels, type OnlineModel } from '../catalog/online';
import { formatLength } from '../model/units';
import { useStore } from '../store/store';

// The importer (and the CAD reader behind it) loads only when it is opened.
const ImportModel = lazy(() => import('./ImportModel'));

const WHERE = { floor: '', wall: 'On a wall', ceiling: 'On the ceiling', surface: 'On furniture' };
/** Garden groups small enough for a balcony. */
const BALCONY_GROUPS = ['Plants', 'Garden'];
const STYLE_LABEL: Record<FurnitureStyle, string> = { simple: 'Simple', realistic: 'Realistic' };

/** The furniture style switch: simple low-poly pieces or realistic textured ones, for the whole project. */
export function StyleSwitch({ compact = false }: { compact?: boolean }) {
  const style = useStore((s) => s.project.furnitureStyle ?? 'simple');
  const set = (next: FurnitureStyle) =>
    useStore.getState().commit((p) => {
      if (next === 'realistic') p.furnitureStyle = 'realistic';
      else delete p.furnitureStyle;
    });
  return (
    <div className={compact ? 'style-switch compact' : 'style-switch'} role="radiogroup" aria-label="Furniture style"
      title="Show the furniture as simple low-poly pieces or as realistic, textured models. Each piece is swapped for the closest one of the same kind, in the same spot.">
      {!compact && <span>Furniture</span>}
      {(['simple', 'realistic'] as const).map((s) => (
        <button key={s} role="radio" aria-checked={style === s} className={style === s ? 'active' : ''} onClick={() => set(s)}>
          {STYLE_LABEL[s]}
        </button>
      ))}
    </div>
  );
}

/**
 * The furniture catalog (indoors) or garden catalog (outdoors), in the
 * project's furniture style. Pieces with nothing of their kind in that style
 * are listed too, marked with the style they come in. Click an item, then
 * click in the room or on the lot to place it.
 */
export function CatalogPanel({ outdoor = false }: { outdoor?: boolean }) {
  const placing = useStore((s) => s.placing);
  const units = useStore((s) => s.project.units);
  const style = useStore((s) => s.project.furnitureStyle ?? 'simple');
  const setPlacing = useStore((s) => s.setPlacing);
  const catalog = useCatalog();
  const [query, setQuery] = useState('');
  /** A category indoors, a group (Trees, Rocks, ...) outdoors, 'mine' for imported models, or 'all'. */
  const [filter, setFilter] = useState('all');
  const [pictures, setPictures] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);

  // An apartment's balcony can have planters, garden furniture and the like from the garden catalog.
  const balcony = useStore((s) => s.project.kind === 'apartment') && !outdoor;
  const hasMine = catalog.some((c) => c.id.startsWith('custom-'));
  const chips = [
    ...(outdoor ? OUTDOOR_GROUPS.map((g) => ({ id: g, label: g })) : CATEGORIES),
    ...(balcony ? [{ id: 'balcony', label: 'Balcony' }] : []),
    ...(hasMine ? [{ id: 'mine', label: 'Your models' }] : []),
  ];
  const inThisCatalog = useMemo(() => {
    const forBalcony = (c: CatalogItem) => balcony && c.category === 'outdoor' && BALCONY_GROUPS.includes(c.group ?? '');
    return (c: CatalogItem) => (c.category === 'outdoor') === outdoor || forBalcony(c);
  }, [outdoor, balcony]);
  const searching = query.trim().length > 0;
  const { shown, otherStyle } = useMemo(() => {
    const forBalcony = (c: CatalogItem) => balcony && c.category === 'outdoor' && BALCONY_GROUPS.includes(c.group ?? '');
    const here = catalog.filter(inThisCatalog);
    // In this style, or of a kind that does not exist in this style (so nothing goes missing).
    // A search looks through both styles, so nothing that matches is hidden.
    const styled = searching ? here : here.filter((c) => c.style === style || !hasCounterpart(c, style));
    const inFilter = styled.filter(
      (c) =>
        filter === 'all' ||
        (filter === 'mine'
          ? c.id.startsWith('custom-')
          : filter === 'balcony'
            ? forBalcony(c)
            : (c.category === 'outdoor' ? c.group : c.category) === filter),
    );
    return { shown: searchCatalog(inFilter, query), otherStyle: searching ? 0 : here.length - styled.length };
  }, [catalog, inThisCatalog, query, searching, filter, balcony, style]);

  // Free models online that match the search, looked up once the user pauses typing.
  const [online, setOnline] = useState<{ query: string; models: OnlineModel[]; failed: string[] } | null>(null);
  const [adding, setAdding] = useState<OnlineModel | null>(null);
  useEffect(() => {
    if (!searching) {
      setOnline(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const { models, failed } = await onlineModels();
      if (cancelled) return;
      const matches = models
        .map((m) => ({ m, score: textScore(m.name, m.tags, query) }))
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((r) => r.m);
      setOnline({ query, models: matches, failed });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, searching]);
  const [onlineShown, setOnlineShown] = useState(12);
  useEffect(() => setOnlineShown(12), [query]);
  const otherCatalog = useMemo(() => catalog.filter((c) => !inThisCatalog(c) && (c.category === 'outdoor') !== outdoor).length, [catalog, inThisCatalog, outdoor]);

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

  const remove = async (c: CatalogItem) => {
    if (!window.confirm(`Remove “${c.name}” from your models? Pieces of it already placed will disappear. This cannot be undone.`)) return;
    if (placing === c.id) setPlacing(null);
    await removeCustomModel(c.id);
  };

  const label = outdoor ? 'Search the garden catalog' : 'Search furniture';
  return (
    <aside className="catalog">
      <StyleSwitch />
      <input className="search" type="search" placeholder={label} aria-label={label}
        value={query} onChange={(e) => setQuery(e.target.value)} />
      {!searching && (
        <div className="quick-searches" aria-label="Common searches">
          {QUICK_SEARCHES.map((q) => (
            <button key={q} className="link" onClick={() => setQuery(q)}>{q}</button>
          ))}
        </div>
      )}
      <div className="chips">
        <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All</button>
        {chips.map((c) => (
          <button key={c.id} className={filter === c.id ? 'active' : ''} onClick={() => setFilter(c.id)}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="count">
        {shown.length} {shown.length === 1 ? 'piece' : 'pieces'}
        {otherStyle > 0 && ` · ${otherStyle} more in the ${style === 'simple' ? 'Realistic' : 'Simple'} style`}
        {/* The other catalog lives in the other 3D tab; say so, so nothing seems to be missing. */}
        {' · '}
        <button className="link" onClick={() => useStore.getState().setMode(outdoor ? 'interior' : 'exterior')}>
          {otherCatalog} more {outdoor ? 'for indoors in Interior' : 'for the garden in Exterior'}
        </button>
      </div>
      <button className="import-model" onClick={() => setImporting(true)}
        title="Add your own model: glTF, OBJ, FBX, STL, PLY, Collada, 3DS, 3MF, or a CAD file (STEP, IGES, BREP)">
        Import a model or CAD file…
      </button>
      {/* The catalog's pieces and, when searching, free models online: one scrolling list. */}
      <div className="catalog-results">
      <div className="catalog-grid">
        {shown.map((c) => (
          <div key={c.id} className="card-wrap">
            <button className={placing === c.id ? 'card active' : 'card'} aria-pressed={placing === c.id}
              title={`${c.name} · ${formatLength(c.size.w, units)} wide, ${formatLength(c.size.d, units)} deep, ${formatLength(c.size.h, units)} high`}
              onClick={() => setPlacing(placing === c.id ? null : c.id)}>
              {pictures[c.id] ? <img src={pictures[c.id]} alt="" loading="lazy" /> : <span className="no-picture" />}
              <span className="name">{c.name}</span>
              {WHERE[c.placement] && <span className="where">{WHERE[c.placement]}</span>}
              {c.style !== style && <span className="where">{searching ? `${STYLE_LABEL[c.style]} style` : `${STYLE_LABEL[c.style]} only`}</span>}
            </button>
            {c.id.startsWith('custom-') && (
              <button className="card-remove" aria-label={`Remove ${c.name}`} title="Remove this model" onClick={() => void remove(c)}>×</button>
            )}
          </div>
        ))}
        {shown.length === 0 && <p className="muted">{query ? `Nothing in the catalog matches “${query}”.` : 'Nothing here yet.'}</p>}
      </div>
      {searching && (
        <section className="online" aria-label="Free models online">
          <h3>Free models online</h3>
          <p className="muted">
            Public-domain (CC0) models from Poly Haven and the Smithsonian. Adding one downloads it into your models.
          </p>
          {!online || online.query !== query ? (
            <p className="muted">Searching…</p>
          ) : (
            <>
              {online.failed.length > 0 && <p className="muted">{online.failed.join(' and ')} could not be reached.</p>}
              {online.models.length === 0 && <p className="muted">Nothing online matches “{query}”.</p>}
              <div className="catalog-grid">
                {online.models.slice(0, onlineShown).map((m) => (
                  <div key={m.id} className="card-wrap">
                    <button className="card online-card" title={`${m.name} · ${m.credit} · click to add it to your models`}
                      onClick={() => setAdding(m)}>
                      <img src={m.thumb} alt="" loading="lazy" />
                      <span className="name">{m.name}</span>
                      <span className="where">{m.source} · Add</span>
                    </button>
                  </div>
                ))}
              </div>
              {online.models.length > onlineShown && (
                <button className="link" onClick={() => setOnlineShown((n) => n + 24)}>
                  Show more ({online.models.length - onlineShown} more)
                </button>
              )}
            </>
          )}
        </section>
      )}
      </div>
      {(importing || adding) && (
        <Suspense fallback={null}>
          <ImportModel outdoor={outdoor} online={adding ?? undefined}
            onClose={() => {
              setImporting(false);
              setAdding(null);
            }}
            onAdded={(id) => {
              setImporting(false);
              setAdding(null);
              setQuery('');
              setFilter('mine');
              setPlacing(id);
            }} />
        </Suspense>
      )}
    </aside>
  );
}
