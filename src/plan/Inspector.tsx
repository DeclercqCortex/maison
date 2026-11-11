import { useEffect, useMemo, useState } from 'react';
import {
  OPENING_DEFAULTS,
  STAIR_SIZES,
  type Feature,
  type Floor,
  type Opening,
  type OpeningType,
  type Project,
  type StairShape,
  type Wall,
} from '../model/types';
import { add, dist, normalize, pointInPolygon, scale, sub } from '../model/geometry';
import { copyWalls, floorAt, removeFloor } from '../model/floors';
import { detectRooms, roomName, setRoomProps, type Room } from '../model/rooms';
import { formatArea, formatLength, INCH, parseLength } from '../model/units';
import { activeFloor, useActiveFloor, useStore } from '../store/store';
import { endsAt } from './wallShape';

/** A text box that only applies its value on Enter or when it loses focus. */
export function CommitField(props: { value: string; onCommit(text: string): void; className?: string; ariaLabel?: string }) {
  const [draft, setDraft] = useState(props.value);
  useEffect(() => setDraft(props.value), [props.value]);
  const apply = () => {
    if (draft !== props.value) props.onCommit(draft);
    setDraft(props.value);
  };
  return (
    <input
      className={props.className}
      aria-label={props.ariaLabel}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={apply}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setDraft(props.value);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

const OPENING_TITLES: Record<OpeningType, string> = { door: 'Door', window: 'Window', archway: 'Archway' };
const FEATURE_TITLES: Record<Feature['type'], string> = { stairs: 'Stairs', fireplace: 'Fireplace', column: 'Column' };
const STAIR_SHAPES: { id: StairShape; label: string }[] = [
  { id: 'straight', label: 'Straight' },
  { id: 'L', label: 'L-shaped' },
  { id: 'U', label: 'U-shaped' },
  { id: 'spiral', label: 'Spiral' },
];

export function Inspector() {
  const floor = useActiveFloor();
  const project = useStore((s) => s.project);
  const units = project.units;
  const selection = useStore((s) => s.selection);
  const rooms = useMemo(() => detectRooms(floor.walls), [floor.walls]);
  const { commit, select } = useStore.getState();
  const editFloor = (fn: (f: Floor) => void) => (p: Project) => fn(activeFloor(p, floor.id));

  const wall = selection?.kind === 'wall' ? floor.walls.find((w) => w.id === selection.id) : undefined;
  const opening = selection?.kind === 'opening' ? floor.openings.find((o) => o.id === selection.id) : undefined;
  const feature = selection?.kind === 'feature' ? floor.features.find((f) => f.id === selection.id) : undefined;
  const room = selection?.kind === 'room' ? rooms.find((r) => pointInPolygon(selection.at, r.polygon)) : undefined;
  const below = floorAt(project, floor.level - 1);
  const above = floorAt(project, floor.level + 1);

  /** A labelled length box that writes a validated value, in metres, back to the model. */
  const lengthField = (label: string, value: number, min: number, max: number, set: (f: Floor, metres: number) => void) => (
    <label>
      {label}
      <CommitField
        value={formatLength(value, units)}
        onCommit={(text) => {
          const metres = parseLength(text, units);
          if (metres) commit(editFloor((f) => set(f, Math.max(min, Math.min(max, metres)))));
        }}
      />
    </label>
  );
  const editOpening = (id: string, fn: (o: Opening) => void) =>
    commit(editFloor((f) => void f.openings.filter((o) => o.id === id).forEach(fn)));
  const editFeature = (id: string, fn: (x: Feature) => void) =>
    commit(editFloor((f) => void f.features.filter((x) => x.id === id).forEach(fn)));

  const setLength = (w: Wall, text: string) => {
    const len = parseLength(text, units);
    if (!len) return;
    const target = add(w.a, scale(normalize(sub(w.b, w.a)), len));
    const moving = endsAt(w.b, floor.walls);
    commit(
      editFloor((f) => {
        for (const part of moving) {
          const x = f.walls.find((y) => y.id === part.wallId);
          if (x) x[part.end] = { ...target };
        }
      }),
    );
  };

  const setThickness = (w: Wall, text: string) => {
    const n = Number(text.replace(/[^\d.]/g, ''));
    if (!Number.isFinite(n) || n <= 0) return;
    const metres = Math.max(0.05, Math.min(1, units === 'metric' ? n / 100 : n * INCH));
    commit(
      editFloor((f) => {
        const x = f.walls.find((y) => y.id === w.id);
        if (x) x.thickness = metres;
      }),
    );
  };

  const rename = (r: Room, text: string) => {
    const clicked = selection?.kind === 'room' ? selection.at : undefined;
    commit(editFloor((f) => setRoomProps(f, r, { name: text.trim() }, clicked)));
  };

  const remove = (kind: 'wall' | 'opening' | 'feature', id: string) => {
    commit(
      editFloor((f) => {
        if (kind === 'wall') f.walls = f.walls.filter((x) => x.id !== id);
        else if (kind === 'opening') f.openings = f.openings.filter((x) => x.id !== id);
        else f.features = f.features.filter((x) => x.id !== id);
      }),
    );
    select(null);
  };

  const total = rooms.reduce((sum, r) => sum + r.area, 0);
  const nothingSelected = !wall && !opening && !feature && !room;

  return (
    <aside className="inspector">
      {wall && (
        <section>
          <h2>Wall</h2>
          <label>
            Length
            <CommitField value={formatLength(dist(wall.a, wall.b), units)} onCommit={(t) => setLength(wall, t)} />
          </label>
          <label>
            Thickness ({units === 'metric' ? 'cm' : 'in'})
            <CommitField
              value={units === 'metric' ? (wall.thickness * 100).toFixed(0) : (wall.thickness / INCH).toFixed(1)}
              onCommit={(t) => setThickness(wall, t)}
            />
          </label>
          <button className="danger" onClick={() => remove('wall', wall.id)}>Delete wall</button>
        </section>
      )}

      {opening && (
        <section>
          <h2>{OPENING_TITLES[opening.type]}</h2>
          <label>
            Type
            <select
              value={opening.type}
              onChange={(e) => {
                const type = e.target.value as OpeningType;
                editOpening(opening.id, (o) => {
                  o.type = type;
                  o.height = OPENING_DEFAULTS[type].height;
                  o.sill = OPENING_DEFAULTS[type].sill;
                });
              }}
            >
              {(Object.keys(OPENING_TITLES) as OpeningType[]).map((t) => (
                <option key={t} value={t}>{OPENING_TITLES[t]}</option>
              ))}
            </select>
          </label>
          {lengthField('Width', opening.width, 0.3, 6, (f, m) => {
            const o = f.openings.find((x) => x.id === opening.id);
            if (o) o.width = m;
          })}
          {lengthField('Height', opening.height, 0.3, floor.wallHeight - opening.sill, (f, m) => {
            const o = f.openings.find((x) => x.id === opening.id);
            if (o) o.height = m;
          })}
          {opening.type === 'window' &&
            lengthField('Height above floor', opening.sill, 0.01, floor.wallHeight - opening.height, (f, m) => {
              const o = f.openings.find((x) => x.id === opening.id);
              if (o) o.sill = m;
            })}
          {opening.type === 'door' && (
            <div className="row">
              <button onClick={() => editOpening(opening.id, (o) => void (o.hingeAtB = !o.hingeAtB))}>Flip hinge</button>
              <button onClick={() => editOpening(opening.id, (o) => void (o.side = o.side === 1 ? -1 : 1))}>Flip swing</button>
            </div>
          )}
          <button className="danger" onClick={() => remove('opening', opening.id)}>
            Delete {OPENING_TITLES[opening.type].toLowerCase()}
          </button>
        </section>
      )}

      {feature && (
        <section>
          <h2>{FEATURE_TITLES[feature.type]}</h2>
          {feature.type === 'stairs' && (
            <label>
              Shape
              <select
                value={feature.shape ?? 'straight'}
                onChange={(e) => {
                  const shape = e.target.value as StairShape;
                  editFeature(feature.id, (x) => void Object.assign(x, { shape, ...STAIR_SIZES[shape] }));
                }}
              >
                {STAIR_SHAPES.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </label>
          )}
          {lengthField('Width', feature.width, 0.1, 10, (f, m) => {
            const x = f.features.find((y) => y.id === feature.id);
            if (!x) return;
            x.width = m;
            if (x.shape === 'spiral') x.depth = m;
          })}
          {feature.shape !== 'spiral' &&
            lengthField(feature.type === 'stairs' ? 'Length' : 'Depth', feature.depth, 0.1, 10, (f, m) => {
              const x = f.features.find((y) => y.id === feature.id);
              if (x) x.depth = m;
            })}
          {feature.type === 'stairs' && (
            <div className="fact">
              <span>Goes up to</span>
              <strong>{above ? above.name : 'no floor above yet'}</strong>
            </div>
          )}
          <button onClick={() => editFeature(feature.id, (x) => void (x.rotation = (x.rotation + 90) % 360))}>
            Turn a quarter (T)
          </button>
          <button className="danger" onClick={() => remove('feature', feature.id)}>
            Delete {FEATURE_TITLES[feature.type].toLowerCase()}
          </button>
        </section>
      )}

      {room && (
        <section>
          <h2>Room</h2>
          <label>
            Name
            <CommitField value={roomName(room, floor.labels)} onCommit={(t) => rename(room, t)} />
          </label>
          <div className="fact">
            <span>Floor area</span>
            <strong>{formatArea(room.area, units)}</strong>
          </div>
        </section>
      )}

      {nothingSelected && (
        <section>
          <h2>Floor</h2>
          <label>
            Name
            <CommitField
              value={floor.name}
              onCommit={(t) => commit(editFloor((f) => void (f.name = t.trim() || f.name)))}
            />
          </label>
          {lengthField('Ceiling height', floor.wallHeight, 1.8, 6, (f, m) => {
            f.wallHeight = m;
            f.walls.forEach((w) => (w.height = m));
          })}
          <div className="fact">
            <span>Floor level</span>
            <strong>
              {floor.elevation < 0 ? '−' : floor.elevation > 0 ? '+' : ''}
              {formatLength(Math.abs(floor.elevation), units)}
            </strong>
          </div>
          {below && below.walls.length > 0 && floor.walls.length === 0 && (
            <button
              onClick={() =>
                commit((p) => {
                  const from = floorAt(p, floor.level - 1);
                  if (from) copyWalls(from, activeFloor(p, floor.id));
                })
              }
            >
              Copy walls from floor below
            </button>
          )}
          {project.floors.length > 1 && (
            <button className="danger" onClick={() => commit((p) => removeFloor(p, floor.id))}>Delete this floor</button>
          )}
        </section>
      )}

      <section>
        <h2>Rooms on this floor</h2>
        {rooms.length === 0 ? (
          <p className="muted">Rooms appear here as soon as walls form a closed shape.</p>
        ) : (
          <ul className="room-list">
            {rooms.map((r, i) => (
              <li key={i}>
                <button className={r === room ? 'active' : ''} onClick={() => select({ kind: 'room', at: r.centroid })}>
                  <span>{roomName(r, floor.labels)}</span>
                  <span>{formatArea(r.area, units)}</span>
                </button>
              </li>
            ))}
            <li className="total">
              <span>Total</span>
              <span>{formatArea(total, units)}</span>
            </li>
          </ul>
        )}
      </section>
    </aside>
  );
}
