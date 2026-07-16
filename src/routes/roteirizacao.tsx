import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Map, Loader2, Package } from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { equipmentLabel } from "@/utils/normalize-equipment";
import { formatPhoneForDisplay } from "@/utils/normalize-phone";
import { calculateAllBalances } from "@/services/equipment-balance";

const RoteirizacaoMap = lazy(() =>
  import("@/components/roteirizacao-map").then((m) => ({ default: m.RoteirizacaoMap })),
);
import {
  buildGoogleMapsRouteUrl,
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
          <div className="flex items-center justify-center h-[500px] border rounded-lg bg-muted/10">
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

      <div className="space-y-4">
        {store.technicians.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Importe técnicos e clientes com endereço para começar.
            </CardContent>
          </Card>
        )}

        {store.technicians.map((tech) => {
          const balance = balances.get(tech.id);
          const techRoutes = routes[tech.id] || {};
          const clientsWithDistance: {
            client: ConfirmedService;
            distance: RouteDistance | null;
          }[] = [];
          for (const c of filteredServices) {
            const d = techRoutes[c.id];
            if (d !== undefined) {
              clientsWithDistance.push({ client: c, distance: d });
            }
          }
          clientsWithDistance.sort((a, b) => {
            if (!a.distance) return 1;
            if (!b.distance) return -1;
            return a.distance.distanceMeters - b.distance.distanceMeters;
          });

          const nearby = clientsWithDistance.filter(
            (c) =>
              c.distance &&
              c.distance.distanceMeters <= MAX_ROUTE_METERS,
          );
          const far = clientsWithDistance.filter(
            (c) =>
              !c.distance ||
              c.distance.distanceMeters > MAX_ROUTE_METERS,
          );
          const pending = filteredServices.length - clientsWithDistance.length;

          if (nearby.length === 0 && far.length === 0 && pending === 0) return null;

          return (
            <Card key={tech.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <CardTitle className="text-base">
                    {tech.nameOriginal}
                  </CardTitle>
                  <Badge variant="outline" className="text-[10px]">
                    {tech.cityOriginal || "—"}/{tech.state || "—"}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    {formatPhoneForDisplay(tech.phoneNormalized) ||
                      tech.phoneOriginal ||
                      "—"}
                  </Badge>
                  {balance && (
                    <Badge variant={balance.available.s8Eco > 0 || balance.available.g5Plus > 0 ? "default" : "destructive"} className="text-[10px] gap-1">
                      <Package className="w-3 h-3" />
                      {balance.available.s8Eco > 0 || balance.available.g5Plus > 0
                        ? `${balance.available.s8Eco} S8 ECO${balance.available.g5Plus > 0 ? ` + ${balance.available.g5Plus} G5` : ""}`
                        : "Sem saldo"}
                    </Badge>
                  )}
                  {balance && balance.available.s8Eco + balance.available.g5Plus > 0 && nearby.length > 0 && (
                    <Badge variant="default" className="text-[10px] bg-green-600 hover:bg-green-600 gap-1">
                      {nearby.length} cliente{nearby.length !== 1 ? "s" : ""} · {nearby[0].distance?.distanceText || "?"}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground ml-auto">
                    {nearby.length} próximo
                    {nearby.length !== 1 ? "s" : ""}
                    {far.length > 0
                      ? ` · ${far.length} distante${far.length !== 1 ? "s" : ""}`
                      : ""}
                    {pending > 0 && ` · ${pending} calculando...`}
                  </span>
                </div>
                {balance && (balance.used.s8Eco > 0 || balance.used.g5Plus > 0 || balance.pending.s8Eco > 0 || balance.pending.g5Plus > 0) && (
                  <div className="flex gap-2 text-[10px] text-muted-foreground mt-1">
                    {balance.used.s8Eco > 0 && <span>Usados: {balance.used.s8Eco} S8 ECO</span>}
                    {balance.used.g5Plus > 0 && <span>Usados: {balance.used.g5Plus} G5+</span>}
                    {balance.pending.s8Eco > 0 && <span className="text-amber-500">Pendentes: {balance.pending.s8Eco} S8 ECO</span>}
                    {balance.pending.g5Plus > 0 && <span className="text-amber-500">Pendentes: {balance.pending.g5Plus} G5+</span>}
                  </div>
                )}
              </CardHeader>
              <CardContent className="p-0">
                {nearby.length > 0 && (
                  <>
                    <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted/30">
                      Próximos (&le;{MAX_ROUTE_METERS / 1000} km)
                    </div>
                    <ul className="divide-y">
                      {nearby.map(({ client, distance }) =>
                        renderClientRow(client, distance, tech),
                      )}
                    </ul>
                  </>
                )}
                {far.length > 0 && (
                  <>
                    <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted/30">
                      Distantes (&gt;{MAX_ROUTE_METERS / 1000} km)
                    </div>
                    <ul className="divide-y">
                      {far.map(({ client, distance }) =>
                        renderClientRow(client, distance, tech),
                      )}
                    </ul>
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function renderClientRow(
  client: ConfirmedService,
  distance: RouteDistance | null,
  tech: Technician,
) {
  return (
    <li
      key={`${tech.id}-${client.id}`}
      className="p-3 grid grid-cols-1 md:grid-cols-[1fr_140px_auto] items-center gap-2 md:gap-4"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">
            {client.responsibleOriginal || "—"}
          </span>
          {client.matrizOriginal && (
            <span className="text-[11px] text-muted-foreground/70">
              {client.matrizOriginal}
            </span>
          )}
          <Badge variant="outline" className="text-[10px]">
            {equipmentLabel(client.equipmentNormalized)}
          </Badge>
          {client.serviceStatus && (
            <Badge variant={
              client.serviceStatus === "AGENDADO" ? "default" :
              client.serviceStatus === "AGENDANDO" ? "secondary" :
              "outline"
            } className="text-[10px]">
              {client.serviceStatus}
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {client.fullAddress ||
            `${client.cityDetected || "—"}/${client.stateDetected || "—"}`}
        </div>
        <div className="text-xs text-muted-foreground">
          {client.plateOriginal || "—"} ·{" "}
          {client.cityDetected || "—"}/{client.stateDetected || "—"}
        </div>
      </div>
      <div className="text-center">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {distance ? "Distância" : ""}
        </div>
        <div className="text-sm font-semibold tabular-nums">
          {distance
            ? `~${distance.distanceText}`
            : "—"}
        </div>
        {distance && (
          <div className="text-xs text-muted-foreground tabular-nums">
            {distance.durationText}
          </div>
        )}
      </div>
      <div>
        <Button size="sm" variant="outline" asChild>
          <a
            href={buildGoogleMapsRouteUrl(tech, client)}
            target="_blank"
            rel="noreferrer"
          >
            <Map className="w-4 h-4 mr-1" /> Maps
          </a>
        </Button>
      </div>
    </li>
  );
}
