import { openDB, type IDBPDatabase } from "idb";
import type { Assignment, ConfirmedService, ImportDiagnostic, InitialContact, Technician } from "@/types";

const DB_NAME = "creare-app";
const DB_VERSION = 1;
const STORE_NAME = "appData";

type DataKind =
  | "initialContacts"
  | "confirmedServices"
  | "technicians"
  | "assignments"
  | "contactedIds"
  | "diagnostics"
  | "meta";

interface ImportMeta {
  fileName: string;
  count: number;
}

interface StoredRecord {
  kind: DataKind;
  data: unknown;
  updatedAt: string;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "kind" });
        }
      },
    });
  }
  return dbPromise;
}

export async function saveToDb(kind: DataKind, data: unknown): Promise<void> {
  const db = await getDb();
  await db.put(STORE_NAME, { kind, data, updatedAt: new Date().toISOString() });
}

export async function loadFromDb<T>(kind: DataKind): Promise<T | undefined> {
  const db = await getDb();
  const record = await db.get(STORE_NAME, kind);
  return record?.data as T | undefined;
}

export async function loadAllFromDb(): Promise<{
  initialContacts?: InitialContact[];
  confirmedServices?: ConfirmedService[];
  technicians?: Technician[];
  assignments?: Assignment[];
  contactedIds?: string[];
  diagnostics?: Partial<Record<"initial" | "confirmed" | "technicians", ImportDiagnostic>>;
  meta?: Partial<Record<"initial" | "confirmed" | "technicians", ImportMeta>>;
}> {
  const db = await getDb();
  const all = await db.getAll(STORE_NAME);
  const result: Record<string, unknown> = {};
  for (const record of all) {
    result[record.kind] = record.data;
  }
  return result;
}

export async function clearDb(): Promise<void> {
  const db = await getDb();
  await db.clear(STORE_NAME);
}
