/** Minimal promise wrapper over IndexedDB for the offline workout queue (NFR-12). */
const DB_NAME = "fitvision";
const STORE = "workouts";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "localId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    t.oncomplete = () => db.close();
  });
}

export const store = {
  put: <T>(value: T) => tx("readwrite", (s) => s.put(value)),
  get: <T>(key: string) => tx<T | undefined>("readonly", (s) => s.get(key) as IDBRequest<T | undefined>),
  all: <T>() => tx<T[]>("readonly", (s) => s.getAll() as IDBRequest<T[]>),
  remove: (key: string) => tx("readwrite", (s) => s.delete(key)),
};
