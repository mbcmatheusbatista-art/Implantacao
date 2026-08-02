import { useEffect, useRef } from "react";
import { useAppStore } from "@/stores/app-store";
import {
  isSupabaseConfigured,
  listarTecnicosSupabase,
  supabaseTecnicoToTechnician,
} from "@/services/supabase";

/**
 * Sincroniza os técnicos cadastrados no Supabase para o store do app em
 * qualquer página. Diferente de uma carga única, este hook concilia o estado:
 * - adiciona técnicos que ainda não existem no store;
 * - atualiza dados de técnicos supabase_* que mudaram no banco;
 * - remove do store técnicos supabase_* que foram deletados no banco.
 *
 * Roda uma vez ao montar e de novo quando a janela recebe foco / o storag
 * muda, para refletir deleção feita em outra aba ou máquina.
 */
export function useSyncSupabaseTecnicos() {
  const syncRunning = useRef(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const sync = async () => {
      if (syncRunning.current) return;
      syncRunning.current = true;
      try {
        const rows = await listarTecnicosSupabase();
        if (cancelled) return;
        const state = useAppStore.getState();
        const current = state.technicians;
        const liveIds = new Set(rows.map((row) => `supabase_${row.id}`));

        // Técnicos supabase que existem no store mas não estão mais no banco → remover.
        const removed = current.filter(
          (t) => t.id.startsWith("supabase_") && !liveIds.has(t.id),
        );
        // Técnicos supabase vivos → substituir pela versão do banco (atualiza edições).
        const liveTechs = rows.map((row) => supabaseTecnicoToTechnician(row));
        const next = [
          ...current.filter((t) => !t.id.startsWith("supabase_")),
          ...liveTechs,
        ];

        const changed =
          removed.length > 0 ||
          liveTechs.length !== current.filter((t) => t.id.startsWith("supabase_")).length ||
          !liveTechs.every(
            (live, i) =>
              JSON.stringify(live) ===
              JSON.stringify(
                current.filter((t) => t.id.startsWith("supabase_"))[i] ?? null,
              ),
          );

        if (!changed) return;
        state.setTechnicians(
          next,
          state.meta?.technicians || { fileName: "", count: next.length },
          state.diagnostics?.technicians || {
            fileName: "",
            columnsFound: [],
            columnsMapped: {},
            columnsUnmapped: [],
            rowsImported: next.length,
            rowsSkipped: 0,
            invalidPhones: 0,
            emptyPlates: 0,
            emptyNames: 0,
            emptyAddresses: 0,
            equipmentUnknown: 0,
            quantityUnparsed: 0,
            groupedContacts: 0,
            nameConflicts: 0,
            timestamp: Date.now(),
            headerRow: 0,
          },
        );
      } finally {
        syncRunning.current = false;
      }
    };

    sync();

    // Re-sincroniza sempre que a aba volta ao foco (deleção/edição pode vir de outra máquina).
    const onFocus = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(sync, 800);
    };
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      if (timer) clearTimeout(timer);
    };
  }, []);
}