/** Data layer — Browser-only IndexedDB vault for durable JSON records and import history. */
export type JsonObject = Record<string, unknown>;

export type VaultRecord = {
  id: string;
  data: JsonObject;
  canonical: string;
  fingerprint: string;
  sourceFileId: string;
  sourceFileName: string;
  sourceIndex: number;
  importedAt: string;
  duplicateOf?: string;
};

export type VaultFile = {
  id: string;
  name: string;
  importedAt: string;
  totalRecords: number;
  newRecords: number;
  duplicates: number;
  bytes: number;
  fields: string[];
};

export type VaultActivity = {
  id: string;
  kind: "import" | "seed" | "export" | "purge";
  title: string;
  detail: string;
  createdAt: string;
};

export type VaultSnapshot = {
  records: VaultRecord[];
  files: VaultFile[];
  activities: VaultActivity[];
};

type ImportSource = { name: string; content: unknown; bytes: number; kind?: "import" | "seed" };

const DB_NAME = "json-vault-explorer";
const DB_VERSION = 1;
const STORES = { records: "records", files: "files", activities: "activities", meta: "meta" } as const;

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.records)) {
        const records = db.createObjectStore(STORES.records, { keyPath: "id" });
        records.createIndex("sourceFileId", "sourceFileId", { unique: false });
        records.createIndex("fingerprint", "fingerprint", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.files)) db.createObjectStore(STORES.files, { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORES.activities)) db.createObjectStore(STORES.activities, { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORES.meta)) db.createObjectStore(STORES.meta, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function requestAsPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeForCanonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeForCanonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as JsonObject)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, normalizeForCanonical(item)])
    );
  }
  return value;
}

export function canonicalize(value: unknown) {
  return JSON.stringify(normalizeForCanonical(value));
}

export function fingerprint(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `JV-${(hash >>> 0).toString(16).toUpperCase().padStart(8, "0")}`;
}

function asRows(content: unknown): JsonObject[] {
  const rows = Array.isArray(content) ? content : [content];
  return rows.map((row) => (row && typeof row === "object" && !Array.isArray(row) ? (row as JsonObject) : { value: row }));
}

function fieldsFromRows(rows: JsonObject[]) {
  return Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).sort((left, right) => left.localeCompare(right));
}

async function getMeta<T>(key: string) {
  const db = await openDatabase();
  const tx = db.transaction(STORES.meta, "readonly");
  const result = (await requestAsPromise(tx.objectStore(STORES.meta).get(key))) as { key: string; value: T } | undefined;
  db.close();
  return result?.value;
}

async function writeMeta(key: string, value: unknown) {
  const db = await openDatabase();
  const tx = db.transaction(STORES.meta, "readwrite");
  tx.objectStore(STORES.meta).put({ key, value });
  await transactionDone(tx);
  db.close();
}

export async function loadVault(): Promise<VaultSnapshot> {
  const db = await openDatabase();
  const tx = db.transaction([STORES.records, STORES.files, STORES.activities], "readonly");
  const [records, files, activities] = await Promise.all([
    requestAsPromise(tx.objectStore(STORES.records).getAll()) as Promise<VaultRecord[]>,
    requestAsPromise(tx.objectStore(STORES.files).getAll()) as Promise<VaultFile[]>,
    requestAsPromise(tx.objectStore(STORES.activities).getAll()) as Promise<VaultActivity[]>,
  ]);
  db.close();
  return {
    records: records.sort((left, right) => right.importedAt.localeCompare(left.importedAt) || left.sourceIndex - right.sourceIndex),
    files: files.sort((left, right) => right.importedAt.localeCompare(left.importedAt)),
    activities: activities.sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
  };
}

export async function importSources(sources: ImportSource[]) {
  const before = await loadVault();
  const canonicalToFirst = new Map(before.records.map((record) => [record.canonical, record]));
  const generatedFiles: VaultFile[] = [];
  const generatedRecords: VaultRecord[] = [];
  const activities: VaultActivity[] = [];
  const importedAt = new Date().toISOString();

  sources.forEach((source) => {
    const rows = asRows(source.content);
    const sourceFileId = makeId();
    let duplicates = 0;
    let newRecords = 0;

    rows.forEach((data, sourceIndex) => {
      const canonical = canonicalize(data);
      const first = canonicalToFirst.get(canonical);
      const record: VaultRecord = {
        id: makeId(),
        data,
        canonical,
        fingerprint: fingerprint(canonical),
        sourceFileId,
        sourceFileName: source.name,
        sourceIndex,
        importedAt,
        ...(first ? { duplicateOf: first.id } : {}),
      };
      if (first) duplicates += 1;
      else {
        canonicalToFirst.set(canonical, record);
        newRecords += 1;
      }
      generatedRecords.push(record);
    });

    generatedFiles.push({
      id: sourceFileId,
      name: source.name,
      importedAt,
      totalRecords: rows.length,
      newRecords,
      duplicates,
      bytes: source.bytes,
      fields: fieldsFromRows(rows),
    });
    activities.push({
      id: makeId(),
      kind: source.kind ?? "import",
      title: source.kind === "seed" ? "Jeu initial chargé" : `${source.name} importé`,
      detail: `${rows.length} lignes lues · ${newRecords} nouvelles · ${duplicates} doublon${duplicates > 1 ? "s" : ""} détecté${duplicates > 1 ? "s" : ""}`,
      createdAt: importedAt,
    });
  });

  const db = await openDatabase();
  const tx = db.transaction([STORES.records, STORES.files, STORES.activities], "readwrite");
  generatedRecords.forEach((record) => tx.objectStore(STORES.records).put(record));
  generatedFiles.forEach((file) => tx.objectStore(STORES.files).put(file));
  activities.forEach((activity) => tx.objectStore(STORES.activities).put(activity));
  await transactionDone(tx);
  db.close();
  return { added: generatedRecords.length, unique: generatedRecords.filter((record) => !record.duplicateOf).length, duplicates: generatedRecords.filter((record) => record.duplicateOf).length };
}

export async function seedInitialData(content: unknown) {
  if (await getMeta<boolean>("initial-dataset-seeded")) return false;
  await importSources([{ name: "tours_1787594542012.json", content, bytes: new Blob([JSON.stringify(content)]).size, kind: "seed" }]);
  await writeMeta("initial-dataset-seeded", true);
  return true;
}

export async function recordExport(records: VaultRecord[]) {
  const db = await openDatabase();
  const tx = db.transaction(STORES.activities, "readwrite");
  tx.objectStore(STORES.activities).put({
    id: makeId(),
    kind: "export",
    title: "Coffre exporté",
    detail: `${records.length} lignes JSON exportées depuis le navigateur`,
    createdAt: new Date().toISOString(),
  } satisfies VaultActivity);
  await transactionDone(tx);
  db.close();
}

export async function purgeDuplicates() {
  const snapshot = await loadVault();
  const duplicateRecords = snapshot.records.filter((record) => record.duplicateOf);
  if (!duplicateRecords.length) return 0;
  const db = await openDatabase();
  const tx = db.transaction([STORES.records, STORES.activities], "readwrite");
  duplicateRecords.forEach((record) => tx.objectStore(STORES.records).delete(record.id));
  tx.objectStore(STORES.activities).put({
    id: makeId(),
    kind: "purge",
    title: "Doublons retirés",
    detail: `${duplicateRecords.length} lignes identiques ont été retirées du coffre`,
    createdAt: new Date().toISOString(),
  } satisfies VaultActivity);
  await transactionDone(tx);
  db.close();
  return duplicateRecords.length;
}

export async function clearVault() {
  const db = await openDatabase();
  const tx = db.transaction([STORES.records, STORES.files, STORES.activities], "readwrite");
  tx.objectStore(STORES.records).clear();
  tx.objectStore(STORES.files).clear();
  tx.objectStore(STORES.activities).clear();
  await transactionDone(tx);
  db.close();
}

export function formatBytes(bytes: number) {
  if (!bytes) return "0 o";
  const units = ["o", "Ko", "Mo", "Go"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

export function exportRecordsJSON(records: VaultRecord[]) {
  return JSON.stringify(records.map((record) => record.data), null, 2);
}
