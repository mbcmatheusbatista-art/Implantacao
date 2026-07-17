import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { calculateAllBalances } from "@/services/equipment-balance";

const RoteirizacaoMap = lazy(() =>
  import("@/components/roteirizacao-map").then((m) => ({ default: m.RoteirizacaoMap })),
);
import {
  calculateApproximateRoute,
  haversineMeters,
  type RouteDistance,
} from "@/services/distance";
import { brCityCoords } from "@/services/br-city-coords";
import type { ConfirmedService, Technician } from "@/types";

const MAX_ROUTE_METERS = 240_000;

const NEIGHBORING_STATES: Record<string, string[]> = {
  AC: ["AM", "RO"],
  AL: ["PE", "SE", "BA"],
  AM: ["AC", "RO", "MT", "PA", "RR"],
  AP: ["PA"],
  BA: ["SE", "AL", "PE", "PI", "TO", "GO", "MG", "ES"],
  CE: ["PI", "PE", "PB", "RN"],
  DF: ["GO", "MG"],
  ES: ["BA", "MG", "RJ"],
  GO: ["DF", "MG", "BA", "TO", "MT", "MS"],
  MA: ["PI", "TO", "PA"],
  MG: ["GO", "DF", "BA", "ES", "RJ", "SP", "MS"],
  MS: ["MT", "GO", "MG", "SP", "PR"],
  MT: ["RO", "AM", "PA", "TO", "GO", "MS"],
  PA: ["AP", "MA", "TO", "MT", "AM", "RR"],
  PB: ["RN", "CE", "PE"],
  PE: ["PB", "CE", "PI", "BA", "AL"],
  PI: ["MA", "TO", "BA", "PE", "CE"],
  PR: ["MS", "SP", "SC"],
  RJ: ["MG", "ES", "SP"],
  RN: ["CE", "PB"],
  RO: ["AC", "AM", "MT"],
  RR: ["AM", "PA"],
  RS: ["SC"],
  SC: ["PR", "RS"],
  SE: ["BA", "AL"],
  SP: ["MG", "RJ", "MS", "PR"],
  TO: ["MA", "PI", "BA", "GO", "MT", "PA"],
};

export const Route = createFileRoute("/roteirizacao")({
  component: RoteirizacaoPage,
});

function RoteirizacaoPage() {
  const store = useAppStore();
  const [routes, setRoutes] = useState<
    Record<string, Record<string, RouteDistance | null>>
  >({});
  const [loading, setLoading] = useState(false);
  const [matrizFilter, setMatrizFilter] = useState<"all" | "none" | Set<string>>("all");
  const cache = useRef<{ data: Record<string, Record<string, RouteDistance | null>>; key: string }>({
    data: {},
    key: "",
  });
  const lastRouteUpdate = useRef(0);
  const ROUTE_UPDATE_INTERVAL = 400;

  const filteredServices = useMemo(() => {
    if (matrizFilter === "all") return store.confirmedServices;
    if (matrizFilter === "none") return [];
    return store.confirmedServices.filter((s) => {
      const m = s.matrizOriginal || "__sem_matriz__";
      return matrizFilter.has(m);
    });
  }, [store.confirmedServices, matrizFilter]);

  useEffect(() => {
    if (!store.technicians.length || !filteredServices.length) return;

    const cacheKey = JSON.stringify(
      filteredServices.map((s) => s.id).sort().join(",") +
        store.technicians.map((t) => t.id).sort().join(","),
    );
    if (cache.current.key === cacheKey) {
      return;
    }

    let cancelled = false;

    // Pre-filter: only calculate nearby pairs (same UF or neighboring UF, within 250km)
    type Pair = { tech: Technician; client: ConfirmedService };
    const pairs: Pair[] = [];

    for (const t of store.technicians) {
      const techCityNorm = (t.cityOriginal || "").toLowerCase();
      const techKey = techCityNorm ? `${techCityNorm}, ${t.state.toLowerCase()}` : null;
      const techCoords = techKey ? brCityCoords[techKey] : null;

      for (const c of filteredServices) {
        const clientCityNorm = (c.cityDetected || "").toLowerCase();
        const clientKey =
          clientCityNorm && c.stateDetected
            ? `${clientCityNorm}, ${c.stateDetected.toLowerCase()}`
            : null;
        const clientCoords = clientKey ? brCityCoords[clientKey] : null;

        // Skip if different state and not neighboring
        if (t.state !== c.stateDetected) {
          const neighbors = NEIGHBORING_STATES[t.state || ""];
          if (!neighbors?.includes(c.stateDetected || "")) continue;
        }

        // Pre-filter by estimated distance
        if (techCoords && clientCoords) {
          const dist = haversineMeters(techCoords, clientCoords);
          if (dist > MAX_ROUTE_METERS * 1.5) continue;
        }

        pairs.push({ tech: t, client: c });
      }
    }

    async function loadAll() {
      setLoading(true);
      const next: Record<string, Record<string, RouteDistance | null>> = {};

      // Calculate routes in chunks to avoid overwhelming the browser
      const chunkSize = 20;
      for (let i = 0; i < pairs.length; i += chunkSize) {
        if (cancelled) return;
        const chunk = pairs.slice(i, i + chunkSize);
        const settled = await Promise.allSettled(
          chunk.map((p) =>
            calculateApproximateRoute(p.tech, p.client).then((d) => ({
              techId: p.tech.id,
              clientId: p.client.id,
              distance: d,
            })),
          ),
        );
        for (const r of settled) {
          if (r.status === "fulfilled" && r.value) {
            const { techId, clientId, distance } = r.value;
            if (!next[techId]) next[techId] = {};
            next[techId][clientId] = distance;
          }
        }
        // Throttle UI updates to at most once every ROUTE_UPDATE_INTERVAL ms
        if (!cancelled) {
          const now = Date.now();
          if (now - lastRouteUpdate.current >= ROUTE_UPDATE_INTERVAL || i + chunkSize >= pairs.length) {
            lastRouteUpdate.current = now;
            setRoutes(JSON.parse(JSON.stringify(next)));
          }
        }
      }

      if (!cancelled) {
        cache.current = { data: next, key: cacheKey };
        setRoutes(next);
        setLoading(false);
      }
    }

    loadAll();
    return () => { cancelled = true; };
  }, [store.technicians, filteredServices]);

  const matrizes = useMemo(
    () =>
      Array.from(
        new Set(
          store.confirmedServices
            .map((s) => s.matrizOriginal)
            .filter((m): m is string => !!m),
        ),
      ).sort(),
    [store.confirmedServices],
  );

  const hasEmptyMatriz = useMemo(
    () => store.confirmedServices.some((s) => !s.matrizOriginal),
    [store.confirmedServices],
  );

  const balances = useMemo(
    () => calculateAllBalances(store.technicians, store.confirmedServices),
    [store.technicians, store.confirmedServices],
  );

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Roteirização por Técnico</h1>
      <p className="text-sm text-muted-foreground">
        Clientes recomendados para cada técnico, ordenados por distância.
      </p>

      {/* Matriz filter */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Filtrar por matriz</CardTitle>
        </CardHeader>
        <CardContent className="pb-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={matrizFilter === "all"}
                onChange={() => setMatrizFilter("all")}
                className="accent-primary"
              />
              Todas as matrizes
            </label>
            {matrizes.map((m) => {
              const checked =
                matrizFilter !== "all" &&
                matrizFilter !== "none" &&
                matrizFilter.has(m);
              return (
                <label
                  key={m}
                  className="flex items-center gap-2 text-xs cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      if (matrizFilter === "all" || matrizFilter === "none") {
                        setMatrizFilter(new Set([m]));
                      } else {
                        const next = new Set(matrizFilter);
                        if (next.has(m)) next.delete(m);
                        else next.add(m);
                        setMatrizFilter(next.size === 0 ? "none" : next);
                      }
                    }}
                    className="accent-primary"
                  />
                  {m}
                </label>
              );
            })}
            {hasEmptyMatriz && (
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={
                    matrizFilter !== "all" &&
                    matrizFilter !== "none" &&
                    matrizFilter.has("__sem_matriz__")
                  }
                  onChange={() => {
                    const m = "__sem_matriz__";
                    if (matrizFilter === "all" || matrizFilter === "none") {
                      setMatrizFilter(new Set([m]));
                    } else {
                      const next = new Set(matrizFilter);
                      if (next.has(m)) next.delete(m);
                      else next.add(m);
                      setMatrizFilter(next.size === 0 ? "none" : next);
                    }
                  }}
                  className="accent-primary"
                />
                Sem matriz
              </label>
            )}
          </div>
        </CardContent>
      </Card>

      {loading && (
        <p className="text-sm text-muted-foreground">
          Calculando rotas...
        </p>
      )}

      <Suspense
        fallback={
          <div className="flex items-center justify-center min-h-[calc(100vh-260px)] border rounded-lg bg-muted/10">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        }
      >
        <RoteirizacaoMap
          technicians={store.technicians}
          clients={filteredServices}
          balances={balances}
          routesByTech={routes}
        />
      </Suspense>
    </div>
  );
}


