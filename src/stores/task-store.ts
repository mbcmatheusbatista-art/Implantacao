import { create } from "zustand";
import { saveToDb, loadFromDb } from "@/services/db";

export type ChecklistData = Record<string, Record<string, string>>;

interface TaskStore {
  manualChecklist: ChecklistData;
  loaded: boolean;
  load: () => Promise<void>;
  updateStep: (plate: string, stepKey: string, value: string) => void;
}

export const useTaskStore = create<TaskStore>((set) => ({
  manualChecklist: {},
  loaded: false,

  load: async () => {
    const data = await loadFromDb<ChecklistData>("checklist");
    if (data) {
      set({ manualChecklist: data, loaded: true });
    } else {
      set({ loaded: true });
    }
  },

  updateStep: (plate, stepKey, value) => {
    set((s) => {
      const plateData = { ...(s.manualChecklist[plate] ?? {}) };
      if (value) {
        plateData[stepKey] = "OK";
      } else {
        delete plateData[stepKey];
      }
      const next = { ...s.manualChecklist, [plate]: plateData };
      saveToDb("checklist", next).catch(() => {});
      return { manualChecklist: next };
    });
  },
}));
