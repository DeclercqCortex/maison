import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { CATEGORIES, OUTDOOR_GROUPS, type CatalogItem, type Category, type Placement } from '../catalog/catalog';
import { addCustomModel } from '../catalog/custom';
import { MODEL_EXTENSIONS, prepare, readModelFiles, toGlb, UNIT_NAMES, type ReadModel, type Unit } from '../catalog/importers';
import { KINDS, kindOf } from '../catalog/kinds';
import { downloadOnlineModel, type OnlineModel } from '../catalog/online';
import { uid } from '../model/types';
import { formatLength, parseLength } from '../model/units';
import { useStore } from '../store/store';

const COMPANIONS = ['mtl', 'bin', 'png', 'jpg', 'jpeg', 'webp', 'tga', 'bmp', 'gif', 'ktx2'];
const ACCEPT = [...MODEL_EXTENSIONS, ...COMPANIONS].map((e) => `.${e}`).join(',');

/** Where a kind of piece usually belongs in the catalog, and how it is placed. */
function defaultsFor(kind: string | undefined, outdoor: boolean): { category: Category; placement: Placement } {
  const k = kind ?? '';
  if (outdoor || ['bench', 'picnic-table', 'planter'].includes(k)) return { category: outdoor ? 'outdoor' : 'decor', placement: 'floor' };
  const category: Category = /^(bed|nightstand|wardrobe|dresser)$/.test(k)
    ? 'bedroom'
    : /^(cabinet-|stove|fridge|microwave|island|dining-table|chair|stool)/.test(k)
      ? 'kitchen'
      : /^(toilet|bathtub|shower|vanity|mirror)$/.test(k)
        ? 'bathroom'
        : /^(desk|office-chair|filing-cabinet|monitor)$/.test(k)
          ? 'office'
          : /^(lamp-|light-|ceiling-fan)/.test(k)
            ? 'lighting'
            : /^(plant|painting|clock|vase|books)/.test(k)
              ? 'decor'
              : 'living';
  const placement: Placement = /^(light-ceiling|light-pendant|ceiling-fan)$/.test(k)
    ? 'ceiling'
    : /^(painting|mirror|clock|light-sconce|cabinet-wall)$/.test(k)
      ? 'wall'
      : /^(lamp-table|vase|books|monitor|microwave)$/.test(k)
        ? 'surface'
        : 'floor';
  return { category, placement };
}

/** Frames the preview camera on the model whenever its size changes. */
function Frame({ size }: { size: { w: number; d: number; h: number } }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update(): void } | null;
  useEffect(() => {
    const radius = Math.max(0.6, Math.hypot(size.w + 1.2, size.d, Math.max(size.h, 1.75)) / 2);
    const target = new THREE.Vector3(0.3, Math.max(size.h, 1.75) / 2, 0);
    camera.position.copy(target).add(new THREE.Vector3(0.55, 0.35, 1).normalize().multiplyScalar(radius * 3));
    camera.lookAt(target);
    controls?.target.copy(target);
    controls?.update();
  }, [size.w, size.d, size.h, camera, controls]);
  return null;
}

/** The model on a floor grid, beside a 1.75 m figure for scale, with an arrow showing which way is its front. */
function Preview({ group, size }: { group: THREE.Group; size: { w: number; d: number; h: number } }) {
  const step = size.w / 2 + 0.6;
  return (
    <Canvas camera={{ fov: 35, near: 0.01, far: 200 }} dpr={[1, 1.5]}>
      <color attach="background" args={['#f1efe9']} />
      <hemisphereLight args={['#ffffff', '#b9b4aa', 1.4]} />
      <directionalLight position={[3, 5, 4]} intensity={1.8} />
      <gridHelper args={[20, 40, '#c3c0b8', '#dedbd3']} />
      <primitive object={group} />
      {/* A person, for scale. */}
      <group position={[step, 0, 0]}>
        <mesh position-y={0.68}>
          <cylinderGeometry args={[0.16, 0.13, 1.36, 16]} />
          <meshStandardMaterial color="#9aa5b1" transparent opacity={0.7} />
        </mesh>
        <mesh position-y={1.6}>
          <sphereGeometry args={[0.12, 16, 12]} />
          <meshStandardMaterial color="#9aa5b1" transparent opacity={0.7} />
        </mesh>
      </group>
      {/* The front: the side that faces into the room. */}
      <mesh position={[0, 0.01, size.d / 2 + 0.25]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.12, 3, Math.PI / 2]} />
        <meshBasicMaterial color="#2f6fdb" />
      </mesh>
      <OrbitControls makeDefault />
      <Frame size={size} />
    </Canvas>
  );
}

/**
 * Adds the user's own model to the catalog: a 3D model file, or a CAD file
 * (STEP, IGES, BREP), turned into a mesh in the browser. It is sized, turned
 * the right way, and saved in this browser as a realistic catalog piece.
 */
export default function ImportModel({ outdoor, online, onClose, onAdded }: {
  outdoor: boolean;
  /** A model from an online library, to download and add, instead of a file the user picks. */
  online?: OnlineModel;
  onClose(): void;
  onAdded(id: string): void;
}) {
  const units = useStore((s) => s.project.units);
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [read, setRead] = useState<ReadModel | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState('');
  const [category, setCategory] = useState<Category>(outdoor ? 'outdoor' : 'living');
  const [group, setGroup] = useState(OUTDOOR_GROUPS[4]);
  const [placement, setPlacement] = useState<Placement>('floor');
  const [unit, setUnit] = useState<Unit>('m');
  const [zUp, setZUp] = useState(false);
  const [turns, setTurns] = useState(0);
  const [scale, setScale] = useState(1);

  useEffect(() => dialog.current?.showModal(), []);

  // An online model is downloaded straight away, then opened like a picked file.
  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    setBusy(true);
    setStatus('Downloading…');
    downloadOnlineModel(online, (t) => !cancelled && setStatus(t))
      .then((files) => void (!cancelled && open(files, online)))
      .catch((err) => {
        if (cancelled) return;
        console.error('Could not download the model', err);
        setError(`${(err as Error).message || 'The model could not be downloaded.'} Check the internet connection and try again.`);
        setStatus('');
        setBusy(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  const open = async (files: File[], from?: OnlineModel) => {
    if (!files.length) return;
    setError('');
    setRead(null);
    setStatus('Reading the file…');
    setBusy(true);
    try {
      const r = await readModelFiles(files, setStatus);
      setRead(r);
      const title = from?.name ?? r.name;
      setName(title.charAt(0).toUpperCase() + title.slice(1));
      setUnit(r.unit);
      setZUp(r.zUp);
      setTurns(0);
      setScale(1);
      const guessed = kindOf({ id: '', name: `${title} ${from?.tags.join(' ') ?? ''}`, size: { w: 1, d: 1, h: 1 } }) ?? '';
      setKind(guessed);
      const d = defaultsFor(guessed || undefined, outdoor);
      setCategory(d.category);
      // Small things that are not furniture (fruit, a cup, an ornament) stand on tables and shelves.
      const { size } = prepare(r, { unit: r.unit, zUp: r.zUp, turns: 0, scale: 1 });
      const small = !guessed && Math.max(size.w, size.d) < 0.6 && size.h < 0.6;
      setPlacement(small && d.placement === 'floor' ? 'surface' : d.placement);
      setCategory(small && d.category === 'living' ? 'decor' : d.category);
      setStatus('');
    } catch (err) {
      console.error('Could not import the model', err);
      setError((err as Error).message || 'This file could not be read.');
      setStatus('');
    } finally {
      setBusy(false);
    }
  };

  const prepared = useMemo(() => (read ? prepare(read, { unit, zUp, turns, scale }) : null), [read, unit, zUp, turns, scale]);

  const add = async () => {
    if (!prepared) return;
    setBusy(true);
    setStatus('Saving the model…');
    try {
      const glb = await toGlb(prepared.group);
      const id = `custom-${uid()}`;
      const { size } = prepared;
      const lit = category === 'lighting';
      const def: CatalogItem = {
        id,
        name: name.trim() || 'Imported model',
        category,
        placement,
        size: { w: +size.w.toFixed(3), d: +size.d.toFixed(3), h: +size.h.toFixed(3) },
        colors: ['#c9ccd1'],
        secondary: '#c9ccd1',
        parts: [],
        model: { file: `custom/${id}.glb`, scale: 1, offset: [0, 0, 0] },
        style: 'realistic',
        ...(kind ? { kind } : {}),
        ...(online ? { tags: online.tags.map((t) => t.toLowerCase()), credit: online.credit } : {}),
        ...(category === 'outdoor' ? { group } : {}),
        ...(lit
          ? { light: { y: placement === 'ceiling' ? -0.05 : +(size.h * 0.85).toFixed(3), intensity: placement === 'ceiling' ? 14 : size.h > 1.2 ? 9 : 5 } }
          : {}),
      };
      await addCustomModel(def, glb);
      onAdded(id);
    } catch (err) {
      console.error('Could not save the model', err);
      setError('The model could not be saved. It may be too large for this browser’s storage.');
      setStatus('');
      setBusy(false);
    }
  };

  const size = prepared?.size;
  const tooBig = !!read && read.triangles > 1_500_000;
  return (
    <dialog ref={dialog} className="import-dialog" onClose={onClose} aria-labelledby="import-title"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void open([...e.dataTransfer.files]);
      }}>
      <div className="import-head">
        <h2 id="import-title">{online ? `Add “${online.name}”` : 'Import a model'}</h2>
        <button className="close" aria-label="Close" onClick={onClose}>×</button>
      </div>
      <div className="import-body">
        <div className="import-preview">
          {prepared && size ? (
            <Preview group={prepared.group} size={size} />
          ) : (
            <button className="drop" onClick={() => input.current?.click()} disabled={busy}>
              <strong>{busy ? status : 'Choose a file, or drop it here'}</strong>
              {!busy && (
                <span>
                  3D models: glTF (.glb, .gltf), OBJ, FBX, STL, PLY, Collada (.dae), 3DS, 3MF.
                  <br />
                  CAD: STEP (.step, .stp), IGES (.iges, .igs), BREP.
                  <br />
                  For a model with separate textures (an OBJ with its .mtl, a .gltf with its .bin), pick all its files together.
                </span>
              )}
            </button>
          )}
          {error && <p className="error" role="alert">{error}</p>}
        </div>
        {read && size && (
          <form className="import-form" onSubmit={(e) => (e.preventDefault(), void add())}>
            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              It is a
              <select value={kind} onChange={(e) => {
                setKind(e.target.value);
                const d = defaultsFor(e.target.value || undefined, outdoor);
                setCategory(d.category);
                setPlacement(d.placement);
              }}>
                <option value="">Something else</option>
                {KINDS.map((k) => (
                  <option key={k.id} value={k.id}>{k.label}</option>
                ))}
              </select>
            </label>
            <p className="hint">In the Realistic style, it can stand in for simple pieces of the same kind.</p>
            <div className="row">
              <label>
                Catalog section
                <select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
                  {[...CATEGORIES, { id: 'outdoor' as Category, label: 'Garden' }].map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </label>
              {category === 'outdoor' ? (
                <label>
                  Garden group
                  <select value={group} onChange={(e) => setGroup(e.target.value)}>
                    {OUTDOOR_GROUPS.map((g) => <option key={g}>{g}</option>)}
                  </select>
                </label>
              ) : (
                <label>
                  Goes
                  <select value={placement} onChange={(e) => setPlacement(e.target.value as Placement)}>
                    <option value="floor">On the floor</option>
                    <option value="wall">On a wall</option>
                    <option value="ceiling">On the ceiling</option>
                    <option value="surface">On furniture</option>
                  </select>
                </label>
              )}
            </div>
            <div className="row">
              <label>
                The file measures in
                <select value={unit} onChange={(e) => (setUnit(e.target.value as Unit), setScale(1))}>
                  {(Object.keys(UNIT_NAMES) as Unit[]).map((u) => <option key={u} value={u}>{UNIT_NAMES[u]}</option>)}
                </select>
              </label>
              <label>
                Up is
                <select value={zUp ? 'z' : 'y'} onChange={(e) => setZUp(e.target.value === 'z')}>
                  <option value="y">Y (most 3D programs)</option>
                  <option value="z">Z (most CAD programs)</option>
                </select>
              </label>
            </div>
            <div className="row">
              <label>
                Width
                <input key={`${size.w}`} defaultValue={formatLength(size.w, units)}
                  onBlur={(e) => {
                    const m = parseLength(e.target.value, units);
                    if (m && m > 0.01) setScale((s) => s * (m / size.w));
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), e.currentTarget.blur())} />
              </label>
              <div className="fact">
                <span>Size</span>
                <strong>
                  {formatLength(size.w, units)} × {formatLength(size.d, units)}, {formatLength(size.h, units)} high
                </strong>
              </div>
            </div>
            <button type="button" onClick={() => setTurns((t) => (t + 1) % 4)}
              title="The blue arrow shows the front: the side that faces into the room">
              Turn a quarter (front is at the blue arrow)
            </button>
            <p className="hint">
              {read.triangles.toLocaleString()} triangles · {online ? `from ${online.credit}` : `from a ${read.format.toUpperCase()} file`}.
              {tooBig && ' That is a lot: the view may slow down with several of these.'}
            </p>
            <div className="actions">
              <button type="button" onClick={() => input.current?.click()} disabled={busy}>Choose another file</button>
              <button type="submit" className="primary" disabled={busy}>{busy ? status || 'Saving…' : 'Add to the catalog'}</button>
            </div>
          </form>
        )}
      </div>
      <input ref={input} type="file" multiple accept={ACCEPT} hidden
        onChange={(e) => {
          void open([...(e.target.files ?? [])]);
          e.target.value = '';
        }} />
    </dialog>
  );
}
