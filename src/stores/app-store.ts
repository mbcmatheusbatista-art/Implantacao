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

  setInitialContacts: (r, meta, diag) =>
    set((s) => ({
      initialContacts: r,
      meta: { ...s.meta, initial: meta },
      diagnostics: { ...s.diagnostics, initial: diag },
      lastInitialContactUpdates: detectInitialContactUpdates(s.initialContacts, r),
    })),
  setConfirmedServices: (r, meta, diag) =>
    set((s) => ({
      confirmedServices: r,
      meta: { ...s.meta, confirmed: meta },
      diagnostics: { ...s.diagnostics, confirmed: diag },
    })),
  setTechnicians: (r, meta, diag) =>
    set((s) => ({
      technicians: r,
      meta: { ...s.meta, technicians: meta },
      diagnostics: { ...s.diagnostics, technicians: diag },
    })),

  toggleContacted: (id) =>
    set((s) => {
      const next = new Set(s.contactedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { contactedIds: next };
    }),

  assign: (serviceId, technicianId, scheduledDate, scheduledTime, notes) =>
    set((s) => {
      const others = s.assignments.filter((a) => a.serviceId !== serviceId);
      return {
        assignments: [...others, { serviceId, technicianId, scheduledDate, scheduledTime, notes }],
      };
    }),
  unassign: (serviceId) =>
    set((s) => ({ assignments: s.assignments.filter((a) => a.serviceId !== serviceId) })),

  clearAll: () =>
    set({
      initialContacts: [],
      confirmedServices: [],
      technicians: [],
      assignments: [],
      contactedIds: new Set(),
      diagnostics: {},
      meta: {},
      lastInitialContactUpdates: [],
    }),
}));

export function getSessionLoads(assignments: Assignment[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const a of assignments) m.set(a.technicianId, (m.get(a.technicianId) ?? 0) + 1);
  return m;
}
