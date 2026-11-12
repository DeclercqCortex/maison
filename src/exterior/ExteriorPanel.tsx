import { ItemSection, Swatches } from '../interior/DecorPanel';
import { floorAt } from '../model/floors';
import { lotSize, wallBounds } from '../model/lot';
import { towerLayout } from '../model/building';
import { clampBuilding, defaultBuilding, MAX_STOREYS, type Building, type RoofType } from '../model/types';
import { formatLength, parseLength } from '../model/units';
import { CommitField } from '../plan/Inspector';
import { useStore } from '../store/store';

const SHAPES = [
  { aspect: 1, label: 'Square' },
  { aspect: 1.5, label: 'Wide (3 : 2)' },
  { aspect: 2, label: 'Very wide (2 : 1)' },
  { aspect: 1 / 1.5, label: 'Deep (2 : 3)' },
  { aspect: 0.5, label: 'Very deep (1 : 2)' },
];
const ROOFS: { id: RoofType; label: string }[] = [
  { id: 'gable', label: 'Gable (two slopes)' },
  { id: 'hip', label: 'Hip (four slopes)' },
  { id: 'shed', label: 'Shed (one slope)' },
  { id: 'flat', label: 'Flat' },
];
const ROOF_COLORS = ['#5a4a42', '#3b3f45', '#8b3a2f', '#a5553a', '#4f6b52', '#7a6a58', '#2f3e55', '#9aa0a6'];
const SIDING_COLORS = ['#f1eee7', '#ffffff', '#e3d5b8', '#c9d6dc', '#b7c4a8', '#d8a48f', '#9a6b4f', '#6f7f8c', '#8b3a2f', '#4a4f57'];

/** Right-hand panel of the Exterior view: the lot, the roof, the outside walls and the selected garden piece. */
export function ExteriorPanel() {
  const project = useStore((s) => s.project);
  const selection = useStore((s) => s.selection);
  const { commit } = useStore.getState();
  const { lot, exterior, units } = project;
  const { width, depth } = lotSize(lot);
  const item = selection?.kind === 'item' ? project.outdoor.find((i) => i.id === selection.id) : undefined;
  const shape = SHAPES.reduce((a, b) => (Math.abs(b.aspect - lot.aspect) < Math.abs(a.aspect - lot.aspect) ? b : a));

  const building = project.kind === 'apartment' ? project.building : undefined;
  const editBuilding = (change: Partial<Building>) =>
    commit((p) => void (p.building = clampBuilding({ ...(p.building ?? defaultBuilding()), ...change })));

  const centreOnHouse = () =>
    commit((p) => {
      const b = towerLayout(p)?.rect ?? wallBounds(floorAt(p, 0) ?? p.floors[0]);
      p.lot.centre = b ? { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 } : { x: 0, y: 0 };
    });

  return (
    <aside className="inspector">
      {item && <ItemSection item={item} edit={(fn) => commit((p) => fn(p.outdoor))} />}

      <section>
        <h2>{building ? 'Your city block' : 'Lot'}</h2>
        <label>
          Size in acres
          <CommitField
            value={String(+lot.acres.toFixed(2))}
            onCommit={(text) => {
              const acres = Number(text.replace(',', '.'));
              if (Number.isFinite(acres) && acres > 0) commit((p) => void (p.lot.acres = Math.max(0.1, Math.min(20, acres))));
            }}
          />
        </label>
        <label>
          Shape
          <select value={shape.aspect} onChange={(e) => commit((p) => void (p.lot.aspect = Number(e.target.value)))}>
            {SHAPES.map((s) => (
              <option key={s.label} value={s.aspect}>{s.label}</option>
            ))}
          </select>
        </label>
        <div className="fact">
          <span>Measures</span>
          <strong>
            {formatLength(width, units)} × {formatLength(depth, units)}
          </strong>
        </div>
        <label className="check">
          <input type="checkbox" checked={lot.fence} onChange={() => commit((p) => void (p.lot.fence = !p.lot.fence))} />
          Fence around the lot
        </label>
        <button onClick={centreOnHouse}>{building ? 'Centre the grounds on the building' : 'Centre the lot on the house'}</button>
      </section>

      {building && (
        <section>
          <h2>Apartment building</h2>
          <label>
            Floors in the building: {building.storeys}
            <input type="range" min="1" max={MAX_STOREYS} step="1" value={building.storeys}
              onChange={(e) => editBuilding({ storeys: Number(e.target.value) })} />
          </label>
          <label>
            Your apartment is on floor
            <select value={building.floor} onChange={(e) => editBuilding({ floor: Number(e.target.value) })}>
              {Array.from({ length: building.storeys }, (_, i) => (
                <option key={i} value={i + 1}>{i === 0 ? '1 (ground floor)' : i + 1}</option>
              ))}
            </select>
          </label>
          <label>
            Apartments side by side
            <select value={building.unitsPerFloor} onChange={(e) => editBuilding({ unitsPerFloor: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <p className="muted">
            The other apartments copy the outside of yours: its windows and balcony. The block stands in a New York–style
            city, with the Empire State Building and the Statue of Liberty out across the river.
          </p>
        </section>
      )}

      <section hidden={!!building}>
        <h2>Roof</h2>
        <label>
          Type
          <select value={exterior.roof.type} onChange={(e) => commit((p) => void (p.exterior.roof.type = e.target.value as RoofType))}>
            {ROOFS.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>
        </label>
        {exterior.roof.type !== 'flat' && (
          <>
            <label>
              Slope: {exterior.roof.pitch}°
              <input type="range" min="10" max="50" step="1" value={exterior.roof.pitch}
                onChange={(e) => commit((p) => void (p.exterior.roof.pitch = Number(e.target.value)))} />
            </label>
            <label>
              Overhang
              <CommitField
                value={formatLength(exterior.roof.overhang, units)}
                onCommit={(text) => {
                  const m = parseLength(text, units);
                  if (m) commit((p) => void (p.exterior.roof.overhang = Math.max(0.05, Math.min(1.5, m))));
                }}
              />
            </label>
          </>
        )}
        <h3>Colour</h3>
        <Swatches colors={ROOF_COLORS} value={exterior.roof.color} custom
          onPick={(color) => commit((p) => void (p.exterior.roof.color = color))} />
      </section>

      <section>
        <h2>Outside walls</h2>
        <Swatches colors={SIDING_COLORS} value={exterior.siding} custom
          onPick={(color) => commit((p) => void (p.exterior.siding = color))} />
      </section>

      <section>
        <h2>In the garden</h2>
        <div className="fact">
          <span>Pieces placed</span>
          <strong>{project.outdoor.length}</strong>
        </div>
      </section>
    </aside>
  );
}
