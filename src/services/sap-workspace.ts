export interface SapShortcut {
  id: string;
  name: string;
  order: number;
  createdAt: string;
  updatedAt: string;
  dataMatrix: string[][];
  columnWidths: number[];
  version: 1;
}

const DB_NAME = "sapWorkspaceDB";
const STORE = "sapShortcuts";
const DRAFTS = "sapDrafts";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(DRAFTS)) db.createObjectStore(DRAFTS, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Não foi possível abrir o banco local SAP."));
    request.onblocked = () => reject(new Error("O banco SAP está bloqueado por outra aba."));
  });
}

async function transaction<T>(storeName: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const request = action(tx.objectStore(storeName));
    let result: T;
    request.onsuccess = () => { result = request.result; };
    request.onerror = () => reject(new Error("Falha ao gravar dados SAP no navegador."));
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = () => reject(tx.error ?? new Error("Falha na transação SAP."));
  });
}

function notifyWorkspaceChange() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("sap-workspace-changed"));
}

export const sapWorkspace = {
  async list(): Promise<SapShortcut[]> {
    const all = await transaction<SapShortcut[]>(STORE, "readonly", (store) => store.getAll());
    return all.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  },
  load(id: string) { return transaction<SapShortcut | undefined>(STORE, "readonly", (store) => store.get(id)); },
  async save(shortcut: SapShortcut) { await transaction(STORE, "readwrite", (store) => store.put(shortcut)); notifyWorkspaceChange(); return shortcut; },
  async create(name: string): Promise<SapShortcut> {
    const existing = await this.list();
    const base = name.trim() || "Novo atalho SAP";
    let finalName = base; let suffix = 2;
    while (existing.some((item) => item.name.toLocaleLowerCase("pt-BR") === finalName.toLocaleLowerCase("pt-BR"))) finalName = `${base} (${suffix++})`;
    const now = new Date().toISOString();
    return this.save({ id: crypto.randomUUID(), name: finalName, order: existing.length, createdAt: now, updatedAt: now, dataMatrix: [], columnWidths: [], version: 1 });
  },
  async remove(id: string) { await transaction(STORE, "readwrite", (store) => store.delete(id)); await transaction(DRAFTS, "readwrite", (store) => store.delete(id)); notifyWorkspaceChange(); },
  saveDraft(shortcut: SapShortcut) { return transaction(DRAFTS, "readwrite", (store) => store.put(shortcut)); },
  loadDraft(id: string) { return transaction<SapShortcut | undefined>(DRAFTS, "readonly", (store) => store.get(id)); },
  clearDraft(id: string) { return transaction(DRAFTS, "readwrite", (store) => store.delete(id)); },
  async exportAll() { return this.list(); },
  async importAll(items: SapShortcut[], replace = false) {
    if (replace) { const current = await this.list(); await Promise.all(current.map((item) => this.remove(item.id))); }
    for (const item of items) if (item?.id && item?.name && Array.isArray(item.dataMatrix)) await this.save({ ...item, version: 1 });
  },
};

export function parseTsv(text: string): string[][] {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n$/, "").split("\n").map((line) => line.split("\t"));
}
export function matrixToTsv(matrix: string[][]): string { return matrix.map((row) => row.join("\t")).join("\n"); }

/** Copies without transforming the matrix, so SAP GUI receives the exact TSV saved by the user. */
export async function copyTsvToClipboard(tsv: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(tsv);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = tsv;
  textarea.setAttribute("readonly", "");
  textarea.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("NÃ£o foi possÃ­vel copiar automaticamente.");
}

export async function copyShortcutToClipboard(id: string): Promise<SapShortcut> {
  const shortcut = await sapWorkspace.load(id);
  if (!shortcut) throw new Error("Atalho SAP nÃ£o encontrado.");
  await copyTsvToClipboard(matrixToTsv(shortcut.dataMatrix));
  return shortcut;
}
