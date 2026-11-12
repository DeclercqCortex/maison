import { setCustomItems, type CatalogItem } from './catalog';

/**
 * Models the user imported, kept in this browser's IndexedDB (they are far
 * too big for localStorage). Each is stored as one binary glTF file with its
 * catalog entry, and added to the catalog when Maison starts.
 */
const DB = 'maison';
const STORE = 'models';

interface Stored {
  id: string;
  def: CatalogItem;
  glb: Blob;
  added: number;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

const urls = new Map<string, string>();

/** Reads every imported model from storage and puts them in the catalog. */
export async function loadCustomModels(): Promise<void> {
  try {
    const all = (await run('readonly', (s) => s.getAll())) as Stored[];
    all.sort((a, b) => a.added - b.added);
    const items = all.map((r) => {
      let url = urls.get(r.id);
      if (!url) {
        url = URL.createObjectURL(r.glb);
        urls.set(r.id, url);
      }
      return { ...r.def, model: { ...r.def.model!, url } };
    });
    setCustomItems(items);
  } catch (err) {
    console.warn('Could not read your imported models', err);
  }
}

/** Saves a new imported model and adds it to the catalog. */
export async function addCustomModel(def: CatalogItem, glb: Blob): Promise<void> {
  const record: Stored = { id: def.id, def: { ...def, model: { ...def.model!, url: undefined } }, glb, added: Date.now() };
  await run('readwrite', (s) => s.put(record));
  await loadCustomModels();
}

export async function removeCustomModel(id: string): Promise<void> {
  await run('readwrite', (s) => s.delete(id));
  const url = urls.get(id);
  if (url) URL.revokeObjectURL(url);
  urls.delete(id);
  await loadCustomModels();
}
