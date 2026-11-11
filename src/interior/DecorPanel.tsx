import { useMemo } from 'react';
import { catalogItem } from '../catalog/catalog';
import { DEFAULT_FLOOR, DEFAULT_WALL_COLOR, FLOOR_MATERIALS, WALL_COLORS } from '../catalog/materials';
import { pointInPolygon } from '../model/geometry';
import { detectRooms, roomLabel, roomName, setRoomProps } from '../model/rooms';
import { uid, type Floor, type Item, type Project, type RoomLabel } from '../model/types';
import { formatArea, formatLength } from '../model/units';
import { CommitField } from '../plan/Inspector';
import { activeFloor, useActiveFloor, useStore } from '../store/store';

export function Swatches(props: { colors: string[]; value: string; onPick(color: string): void; names?: string[]; custom?: boolean }) {
  return (
    <div className="swatches">
      {props.colors.map((c, i) => (
        <button key={c + i} className={c === props.value ? 'swatch active' : 'swatch'} style={{ background: c }}
          title={props.names?.[i] ?? c} aria-label={props.names?.[i] ?? c} aria-pressed={c === props.value}
          onClick={() => props.onPick(c)} />
      ))}
      {props.custom && (
        <input type="color" title="Any colour" aria-label="Any colour" value={props.value}
          onChange={(e) => props.onPick(e.target.value)} />
      )}
    </div>
  );
}

/**
 * Details and actions for one placed piece. `edit` applies a change to the
 * list the piece lives in (a floor's furniture, or the lot's garden pieces).
 */
export function ItemSection({ item, edit }: { item: Item; edit(fn: (list: Item[]) => void): void }) {
  const units = useStore((s) => s.project.units);
  const select = useStore((s) => s.select);
  const def = catalogItem(item.catalogId);
  if (!def) return null;
  const change = (fn: (i: Item) => void) => edit((list) => void list.filter((i) => i.id === item.id).forEach(fn));
  return (
    <section>
      <h2>{def.name}</h2>
      <div className="fact">
        <span>Size</span>
        <strong>
          {formatLength(def.size.w, units)} × {formatLength(def.size.d, units)}
        </strong>
      </div>
      <div className="fact">
        <span>Height</span>
        <strong>{formatLength(def.size.h, units)}</strong>
      </div>
      {def.colors.length > 1 && (
        <>
          <h3>Colour</h3>
          <Swatches colors={def.colors} value={item.color ?? def.colors[0]} custom
            onPick={(color) => change((i) => void (i.color = color))} />
        </>
      )}
      <div className="row">
        <button onClick={() => change((i) => void (i.rotation = (i.rotation + 90) % 360))}>Turn (T)</button>
        <button
          onClick={() => {
            const id = uid();
            const shift = Math.max(0.3, (def.collide?.w ?? def.size.w) + 0.2);
            edit((list) => void list.push({ ...item, id, at: { x: item.at.x + shift, y: item.at.y } }));
            select({ kind: 'item', id });
          }}
        >
          Duplicate
        </button>
      </div>
      <button className="danger"
        onClick={() => {
          edit((list) => {
            const at = list.findIndex((i) => i.id === item.id);
            if (at >= 0) list.splice(at, 1);
          });
          select(null);
        }}
      >
        Remove
      </button>
    </section>
  );
}

/** Right-hand panel of the Interior view: the selected piece of furniture, or the selected room's finishes. */
export function DecorPanel() {
  const floor = useActiveFloor();
  const units = useStore((s) => s.project.units);
  const selection = useStore((s) => s.selection);
  const rooms = useMemo(() => detectRooms(floor.walls), [floor.walls]);
  const { commit } = useStore.getState();
  const editFloor = (fn: (f: Floor) => void) => (p: Project) => fn(activeFloor(p, floor.id));

  const item = selection?.kind === 'item' ? floor.items.find((i) => i.id === selection.id) : undefined;
  const room = selection?.kind === 'room' ? rooms.find((r) => pointInPolygon(selection.at, r.polygon)) : undefined;
  const label = room && roomLabel(room, floor.labels);

  const styleRoom = (props: Partial<Pick<RoomLabel, 'name' | 'floorMaterial' | 'wallColor'>>) => {
    if (!room) return;
    const clicked = selection?.kind === 'room' ? selection.at : undefined;
    commit(editFloor((f) => setRoomProps(f, room, props, clicked)));
  };

  return (
    <aside className="inspector">
      {item && <ItemSection item={item} edit={(fn) => commit(editFloor((f) => fn(f.items)))} />}

      {room && (
        <section>
          <h2>Room</h2>
          <label>
            Name
            <CommitField value={roomName(room, floor.labels)} onCommit={(t) => styleRoom({ name: t.trim() })} />
          </label>
          <div className="fact">
            <span>Floor area</span>
            <strong>{formatArea(room.area, units)}</strong>
          </div>
          <h3>Flooring</h3>
          <Swatches colors={FLOOR_MATERIALS.map((m) => m.color)} names={FLOOR_MATERIALS.map((m) => m.name)}
            value={(FLOOR_MATERIALS.find((m) => m.id === (label?.floorMaterial ?? DEFAULT_FLOOR)) ?? FLOOR_MATERIALS[0]).color}
            onPick={(color) => styleRoom({ floorMaterial: FLOOR_MATERIALS.find((m) => m.color === color)!.id })} />
          <h3>Wall paint</h3>
          <Swatches colors={WALL_COLORS} value={label?.wallColor ?? DEFAULT_WALL_COLOR} custom
            onPick={(color) => styleRoom({ wallColor: color })} />
        </section>
      )}

      {!item && !room && (
        <section>
          <h2>Decorate</h2>
          <p className="muted">
            Pick something from the catalog on the left, then click in the room to place it.
          </p>
          <p className="muted">Click a piece of furniture to move, turn, recolour or remove it.</p>
          <p className="muted">Click the floor of a room to change its flooring and wall paint.</p>
        </section>
      )}

      <section>
        <h2>On this floor</h2>
        <div className="fact">
          <span>Pieces placed</span>
          <strong>{floor.items.length}</strong>
        </div>
      </section>
    </aside>
  );
}
