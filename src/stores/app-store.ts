import { create } from "zustand";
import type {
  Assignment,
  ConfirmedService,
  ImportDiagnostic,
  ImportKind,
  InitialContact,
  Technician,
} from "@/types";
import {
  detectInitialContactUpdates,
  type InitialContactUpdate,
} from "@/services/initial-contact-updates";
import { saveToDb, clearDb, loadAllFromDb } from "@/services/db";

interface ImportMeta {
  fileName: string;
  count: number;
}

interface AppState {
  initialContacts: InitialContact[];
  confirmedServices: ConfirmedService[];
  technicians: Technician[];
  assignments: Assignment[];
  contactedIds: Set<string>;
  diagnostics: Partial<Record<ImportKind, ImportDiagnostic>>;
  meta: Partial<Record<ImportKind, ImportMeta>>;
  lastInitialContactUpdates: InitialContactUpdate[];

  setInitialContacts: (r: InitialContact[], meta: ImportMeta, diag: ImportDiagnostic) => void;
  setConfirmedServices: (r: ConfirmedService[], meta: ImportMeta, diag: ImportDiagnostic) => void;
  setTechnicians: (r: Technician[], meta: ImportMeta, diag: ImportDiagnostic) => void;
  replaceImportRecords: (
    kind: ImportKind,
    records: InitialContact[] | ConfirmedService[] | Technician[],
  ) => void;

  toggleContacted: (id: string) => void;
  assign: (
    serviceId: string,
    technicianId: string,
    date?: string,
    time?: string,
    notes?: string,
  ) => void;
  unassign: (serviceId: string) => void;

  clearAll: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  initialContacts: [],
  confirmedServices: [],
  technicians: [],
  assignments: [],
  contactedIds: new Set(),
  diagnostics: {},
  meta: {},
  lastInitialContactUpdates: [],

  setInitialContacts: (r, meta, diag) => {
    set((s) => ({
      initialContacts: r,
      meta: { ...s.meta, initial: meta },
      diagnostics: { ...s.diagnostics, initial: diag },
      lastInitialContactUpdates: detectInitialContactUpdates(s.initialContacts, r),
    }));
    saveToDb("initialContacts", r).catch(() => {});
    saveToDb("meta", { ...meta }).catch(() => {});
    saveToDb("diagnostics", { initial: diag }).catch(() => {});
  },
  setConfirmedServices: (r, meta, diag) => {
    set((s) => ({
      confirmedServices: r,
      meta: { ...s.meta, confirmed: meta },
      diagnostics: { ...s.diagnostics, confirmed: diag },
    }));
    saveToDb("confirmedServices", r).catch(() => {});
    saveToDb("diagnostics", { confirmed: diag }).catch(() => {});
  },
  setTechnicians: (r, meta, diag) => {
    const fixPhone = (t: Technician) =>
      t.nameOriginal.toLowerCase().includes("marcos luiz amorim")
        ? { ...t, phoneOriginal: "11 91484-3217", phoneNormalized: "5511914843217", allPhones: ["5511914843217"] }
        : t;
    const fixed = r.map(fixPhone);
    set((s) => ({
      technicians: fixed,
      meta: { ...s.meta, technicians: meta },
      diagnostics: { ...s.diagnostics, technicians: diag },
    }));
    saveToDb("technicians", fixed).catch(() => {});
    saveToDb("diagnostics", { technicians: diag }).catch(() => {});
  },
  replaceImportRecords: (kind, records) => {
    set((s) => {
      const count = records.length;
      const nextMeta = s.meta[kind]
        ? { ...s.meta, [kind]: { ...s.meta[kind]!, count } }
        : s.meta;
      if (kind === "initial") return { initialContacts: records as InitialContact[], meta: nextMeta };
      if (kind === "confirmed") return { confirmedServices: records as ConfirmedService[], meta: nextMeta };
      return { technicians: records as Technician[], meta: nextMeta };
    });
    const key = kind === "initial" ? "initialContacts" : kind === "confirmed" ? "confirmedServices" : "technicians";
    saveToDb(key, records).catch(() => {});
    const { meta } = useAppStore.getState();
    saveToDb("meta", meta).catch(() => {});
  },

  toggleContacted: (id) => {
    set((s) => {
      const next = new Set(s.contactedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { contactedIds: next };
    });
    const { contactedIds } = useAppStore.getState();
    saveToDb("contactedIds", [...contactedIds]).catch(() => {});
  },

  assign: (serviceId, technicianId, scheduledDate, scheduledTime, notes) => {
    set((s) => {
      const others = s.assignments.filter((a) => a.serviceId !== serviceId);
      return {
        assignments: [...others, { serviceId, technicianId, scheduledDate, scheduledTime, notes }],
      };
    });
    const { assignments } = useAppStore.getState();
    saveToDb("assignments", assignments).catch(() => {});
  },
  unassign: (serviceId) => {
    set((s) => ({ assignments: s.assignments.filter((a) => a.serviceId !== serviceId) }));
    const { assignments } = useAppStore.getState();
    saveToDb("assignments", assignments).catch(() => {});
  },

  clearAll: () => {
    set({
      initialContacts: [],
      confirmedServices: [],
      technicians: [],
      assignments: [],
      contactedIds: new Set(),
      diagnostics: {},
      meta: {},
      lastInitialContactUpdates: [],
    });
    clearDb().catch(() => {});
  },
}));

export async function hydrateFromDb(): Promise<void> {
  try {
    const data = await loadAllFromDb();
    if (!data) return;

    const toSet: Partial<AppState> = {};

    if (data.technicians) {
      toSet.technicians = data.technicians.map((t) =>
        t.nameOriginal.toLowerCase().includes("marcos luiz amorim")
          ? { ...t, phoneOriginal: "11 91484-3217", phoneNormalized: "5511914843217", allPhones: ["5511914843217"] }
          : t,
      );
    }
    if (data.confirmedServices) toSet.confirmedServices = data.confirmedServices;
    if (data.initialContacts) toSet.initialContacts = data.initialContacts;
    if (data.assignments) toSet.assignments = data.assignments;
    if (data.contactedIds) toSet.contactedIds = new Set(data.contactedIds);
    if (data.diagnostics) toSet.diagnostics = data.diagnostics as Partial<Record<ImportKind, ImportDiagnostic>>;
    if (data.meta) toSet.meta = data.meta as Partial<Record<ImportKind, ImportMeta>>;

    if (Object.keys(toSet).length > 0) {
      useAppStore.setState(toSet);
    }
  } catch (err) {
    console.warn("[DB] Hydration failed (expected on first load)", err);
  }
}

export function getSessionLoads(assignments: Assignment[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const a of assignments) m.set(a.technicianId, (m.get(a.technicianId) ?? 0) + 1);
  return m;
}
