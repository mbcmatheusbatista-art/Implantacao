import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ClipboardList } from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { useTaskStore } from "@/stores/task-store";
import { TarefaCard } from "@/components/tarefa-card";
import { loadPlateMeta, type PlateMetaMap } from "@/services/plate-meta";
import { stripFormatMarkers } from "@/utils/normalize-text";

export const Route = createFileRoute("/tarefas")({
  component: TarefasPage,
});

interface PlateRecord {
  plate: string;
  responsible: string;
  city: string | null;
  state: string | null;
  status: string | undefined;
  statusOriginal: string | undefined;
  hasAddress: boolean;
}

function TarefasPage() {
  const store = useAppStore();
  const loaded = useTaskStore((s) => s.loaded);
  const loadChecklist = useTaskStore((s) => s.load);
  const [search, setSearch] = useState("");
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [plateMeta, setPlateMeta] = useState<PlateMetaMap>({});

  useEffect(() => {
    loadChecklist();
    loadPlateMeta().then((data) => {
      setPlateMeta(data);
    }).catch(() => {});
  }, [loadChecklist]);

  const confirmedByPlate = useMemo(() => {
    const map = new Map<string, (typeof store.confirmedServices)[number]>();
    for (const s of store.confirmedServices) {
      const key = s.plateNormalized || s.plateOriginal;
      if (key && !map.has(key)) map.set(key, s);
    }
    return map;
  }, [store.confirmedServices]);

  const plates = useMemo(() => {
    const seen = new Set<string>();
    const result: PlateRecord[] = [];

    for (const contact of store.initialContacts) {
      for (const rawPlate of contact.plates) {
        const plate = rawPlate.trim().toUpperCase();
        if (!plate || seen.has(plate)) continue;
        seen.add(plate);

        const confirmed = confirmedByPlate.get(plate);
        const meta = plateMeta[plate];
        const fullAddress = confirmed?.fullAddress || meta?.address || "";
        const status = confirmed?.serviceStatus || "";
        const statusOrig = confirmed?.serviceStatusOriginal || meta?.status || "";

        result.push({
          plate,
          responsible: contact.responsibleOriginal,
          city: confirmed?.cityDetected ?? null,
          state: confirmed?.stateDetected ?? null,
          status: status || undefined,
          statusOriginal: statusOrig || undefined,
          hasAddress: !!fullAddress,
        });
      }
    }
    const uniqueStatuses = [...new Set(result.map(p => stripFormatMarkers(p.statusOriginal || p.status || "").trim().toUpperCase()).filter(Boolean))].sort();
    console.log("[TAREFAS] plates computed", { count: result.length, uniqueStatuses, sample: result.slice(0, 5).map(p => ({ plate: p.plate, statusOriginal: p.statusOriginal, status: p.status })) });
    return result;
  }, [store.initialContacts, confirmedByPlate, plateMeta]);

  const agendarVariants = useMemo(() => {
    const set = new Set<string>();
    for (const p of plates) {
      const orig = stripFormatMarkers(p.statusOriginal || "").trim().toUpperCase();
      if (orig && (orig === "AGENDAR" || orig.startsWith("AGENDAR"))) {
        set.add(orig);
      }
    }
    return [...set].sort();
  }, [plates]);

  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase();
    let list = plates;
    if (q) {
      list = list.filter((p) => p.plate.includes(q));
    }
    if (activeFilters.size > 0) {
      list = list.filter((p) => {
        const statusNorm = (p.status || "").trim().toUpperCase();
        const statusOrig = stripFormatMarkers(p.statusOriginal || "").trim().toUpperCase();

        for (const f of activeFilters) {
          if (f === "agendado" && statusNorm === "AGENDADO") return true;
          if (f === "agendando" && statusNorm === "AGENDANDO") return true;
          if (f === "finalizado" && statusNorm === "FINALIZADO") return true;
          if (f === "mobi7" && statusOrig === "COM MOBI7") return true;
          if (f !== "agendado" && f !== "agendando" && f !== "finalizado" && f !== "mobi7" && statusOrig === f) return true;
        }
        return false;
      });
    }
    return list;
  }, [plates, search, activeFilters, agendarVariants]);

  function toggleFilter(key: string) {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (!loaded) {
    return (
      <div className="space-y-4 max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-6 h-6" />
          <h1 className="text-2xl font-bold">Tarefas</h1>
        </div>
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="w-6 h-6" /> Tarefas
          </h1>
          <p className="text-sm text-muted-foreground">
            {plates.length} veículo(s) importado(s).
          </p>
        </div>
      </div>

      {plates.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 text-center text-muted-foreground">
          Nenhum veículo importado ainda. Importe a planilha em <b>Contato com cliente</b> para começar.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              placeholder="Pesquisar placa..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {[
                { key: "agendado", label: "Agendado" },
                { key: "agendando", label: "Agendando" },
                { key: "finalizado", label: "Finalizado" },
                ...agendarVariants.map(v => ({ key: v, label: v })),
              ].map(({ key, label }) => (
                <label
                  key={key}
                  className="flex items-center gap-1.5 text-sm cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    className="accent-primary h-4 w-4 rounded"
                    checked={activeFilters.has(key)}
                    onChange={() => toggleFilter(key)}
                  />
                  {label.length > 30 ? label.slice(0, 30) + "..." : label}
                </label>
              ))}
              <label
                key="mobi7"
                className="flex items-center gap-1.5 text-sm cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  className="accent-primary h-4 w-4 rounded"
                  checked={activeFilters.has("mobi7")}
                  onChange={() => toggleFilter("mobi7")}
                />
                MOBI7
              </label>
            </div>
            <Badge variant="secondary">{filtered.length} exibidos</Badge>
          </div>

          <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4 space-y-4">
            {filtered.map((p) => (
              <TarefaCard
                key={p.plate}
                plate={p.plate}
                responsible={p.responsible}
                city={p.city}
                state={p.state}
                status={p.status}
                statusOriginal={p.statusOriginal}
                hasAddress={p.hasAddress}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
