import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, MessageCircle, Undo2, Info, Map } from "lucide-react";
import { toast } from "sonner";
import { useAppStore, getSessionLoads } from "@/stores/app-store";
import { MessageDialog } from "@/components/message-dialog";
import { rankTechnicians, type ScoredTechnician } from "@/services/recommendation";
import { buildTechnicianMessage, buildGroupedTechnicianMessage } from "@/services/messages";
import { formatPhoneForDisplay } from "@/utils/normalize-phone";
import { equipmentLabel } from "@/utils/normalize-equipment";
import { stockStatusLabel } from "@/utils/parse-quantity";
import {
  buildGoogleMapsRouteUrl,
  calculateApproximateRoute,
  calculateKnownCityRoute,
  getServiceDestination,
  haversineMeters,
  normalize,
  type RouteDistance,
  type RouteMode,
} from "@/services/distance";
import { brCityCoords } from "@/services/br-city-coords";
import { buildWhatsAppUrl } from "@/utils/whatsapp-url";
import { extractCityAndStateFromAddress, stripAddressLinks } from "@/utils/extract-location";
import type { ConfirmedService, Technician } from "@/types";
import { applySeedAddresses, getFixedTechnicianLocationKey, getSeedTechnicians } from "@/services/seed-data";

const MAX_ROUTE_METERS = 900_000;

function cityKeyFromAddress(address: string): string | null {
  const normalizedAddress = address.replace(/[–—]/g, "-");
  const stateMatches = Array.from(
    normalizedAddress.matchAll(/[-/]\s*([A-Z]{2})(?=\s*[,\-]|\s*\d{5}|\s*$)/g),
  );
  const stateMatch = stateMatches[stateMatches.length - 1];
  if (!stateMatch || stateMatch.index === undefined) return null;

  const beforeState = normalizedAddress.slice(0, stateMatch.index);
  const city = beforeState.split(/[,-]/).map((part) => part.trim()).filter(Boolean).pop();
  const state = stateMatch[1].toLocaleLowerCase("pt-BR");
  return city ? `${normalize(city).toLocaleLowerCase("pt-BR")}, ${state}` : null;
}

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

const searchSchema = z.object({
  serviceId: z.string().optional(),
});

export const Route = createFileRoute("/distribuicao")({
  validateSearch: searchSchema,
  component: DistributionPage,
});

const CATEGORY_LABEL: Record<string, string> = {
  recomendados: "Recomendados",
  mesma_uf: "Mesma UF",
  confirmar: "Necessitam confirmação",
  sem_material: "Sem material",
  outras: "Outras localidades",
};

function DistributionPage() {
  const store = useAppStore();
  const { serviceId: initialId } = Route.useSearch();
  const [selectedServiceId, setSelectedServiceId] = useState<string | undefined>(initialId);
  const [dates, setDates] = useState<Record<string, string>>({});
  const [times, setTimes] = useState<Record<string, string>>({});
  const [messageTech, setMessageTech] = useState<Technician | null>(null);
  const [messageMode, setMessageMode] = useState<"single" | "group">("single");
  const [routes, setRoutes] = useState<Record<string, { distance: RouteDistance | null; mode: RouteMode }>>({});
  const [showDistantes, setShowDistantes] = useState(false);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [matrizFilter, setMatrizFilter] = useState<"all" | "none" | Set<string>>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [clientSearchQuery, setClientSearchQuery] = useState("");
  // Reset routes on service switch; the main effect recalculates the estimates.
  useEffect(() => {
    setRoutes({});
    setShowDistantes(false);
    setLoadingRoutes(true);
  }, [selectedServiceId]);

  const service = useMemo(() => {
    const selected = store.confirmedServices.find((s) => s.id === selectedServiceId);
    if (!selected) return undefined;
    // Older imports may have a Google Maps link appended directly to the
    // address. Clean it and recover city/UF before ranking or routing.
    const fullAddress = stripAddressLinks(selected.fullAddress);
    const locality = extractCityAndStateFromAddress(fullAddress);
    return {
      ...selected,
      fullAddress,
      cityDetected: locality.city ?? selected.cityDetected,
      stateDetected: locality.state ?? selected.stateDetected,
    };
  }, [selectedServiceId, store.confirmedServices]);

  const loads = useMemo(() => getSessionLoads(store.assignments), [store.assignments]);

  // The fixed register is always available for recommendations. Imported
  // technicians not in that register are retained with their imported address.
  const technicians = useMemo(() => {
    const imported = applySeedAddresses(store.technicians);
    const importedFixedLocations = new Set(
      imported.map(getFixedTechnicianLocationKey).filter((key): key is string => Boolean(key)),
    );
    const fixedOnly = getSeedTechnicians().filter(
      (technician) => {
        const fixedKey = getFixedTechnicianLocationKey(technician);
        return !fixedKey || !importedFixedLocations.has(fixedKey);
      },
    );
    return [...imported, ...fixedOnly];
  }, [store.technicians]);

  const scored = useMemo(() => {
    if (!service) return [];
    return rankTechnicians(technicians, service, loads);
  }, [service?.id, technicians, loads]);

  const currentAssignment = useMemo(
    () => (service ? store.assignments.find((a) => a.serviceId === service.id) : undefined),
    [service, store.assignments],
  );

  // Calculate approximate routes for every technician with a usable location,
  // including those shown in "Outras localidades".
  useEffect(() => {
    if (!service) return;
    if (technicians.length === 0) return;

    const svc = service;
    const svcState = svc.stateDetected;
    let cancelled = false;

    // Get service coords for pre-filter (use normalize to strip accents and match brCityCoords keys)
    const svcCityNormalized = svc.cityDetected ? normalize(svc.cityDetected.toLocaleLowerCase("pt-BR")) : null;
    const svcKey = svcCityNormalized && svcState
      ? `${svcCityNormalized}, ${svcState.toLocaleLowerCase("pt-BR")}`
      : null;
    const svcCoords = svcKey ? brCityCoords[svcKey] : null;

    // Separate techs by proximity
    const sameUf: Technician[] = [];
    const neighborUf: { tech: Technician; dist: number }[] = [];
    const skipped: Technician[] = [];

    for (const t of technicians) {
      if (t.state === svcState) {
        sameUf.push(t);
      } else if (svcState && NEIGHBORING_STATES[svcState]?.includes(t.state)) {
        // Estimate distance for pre-filter
        const techCityNorm = normalize(t.cityOriginal.toLocaleLowerCase("pt-BR"));
        const techKey = `${techCityNorm}, ${t.state.toLocaleLowerCase("pt-BR")}`;
        const techCoords = brCityCoords[techKey];
        if (svcCoords && techCoords) {
          const d = haversineMeters(svcCoords, techCoords);
          if (d <= MAX_ROUTE_METERS) {
            neighborUf.push({ tech: t, dist: d });
          } else {
            skipped.push(t);
          }
        } else {
          // Can't estimate — include conservatively
          neighborUf.push({ tech: t, dist: Infinity });
        }
      } else {
        skipped.push(t);
      }
    }

    // Pick closest 3 neighbors
    neighborUf.sort((a, b) => a.dist - b.dist);
    const neighborTechs = neighborUf.slice(0, 3).map((n) => n.tech);
    const remainingNeighbors = neighborUf.slice(3).map((n) => n.tech);

    // The former rule only calculated the same UF and three neighbouring
    // technicians. Keep that prioritisation in the display, but calculate the
    // approximate distance for the other-localities cards as well.
    const techsToCalc = technicians.filter(
      (tech) => Boolean(tech.address || (tech.cityOriginal && tech.state)),
    );

    async function loadAll() {
      setLoadingRoutes(true);
      const initial: Record<string, { distance: RouteDistance | null; mode: RouteMode }> = {};
      for (const t of technicians) initial[t.id] = { distance: null, mode: "approximate" };
      if (!cancelled) setRoutes(initial);

      const next = { ...initial };
      const pendingRemoteCalculations: Technician[] = [];
      for (const tech of techsToCalc) {
        // The technician and the selected client already carry city/UF in
        // the distribution data. Prefer those authoritative fields here;
        // parsing a street address is only a fallback for older records.
        const techCity = normalize(tech.cityOriginal || "").toLocaleLowerCase("pt-BR");
        const techState = (tech.state || "").toLocaleLowerCase("pt-BR");
        const techCoordinates = techCity && techState
          ? brCityCoords[`${techCity}, ${techState}`]
          : null;
        if (svcCoords && techCoordinates) {
          const straightMeters = haversineMeters(techCoordinates, svcCoords);
          const meters = straightMeters < 100 && tech.address && svc.fullAddress
            ? 6500
            // City-centre points understate road routes; use a conservative
            // road factor until street-level routing is requested in Maps.
            : Math.max(1000, Math.round(straightMeters * 1.75));
          const seconds = Math.round((meters / 1000 / 75) * 3600);
          const distance: RouteDistance = {
            distanceMeters: meters,
            distanceText: `~${Math.round(meters / 1000)} km`,
            durationText: `~${seconds < 3600 ? `${Math.max(1, Math.round(seconds / 60))} min` : `${Math.floor(seconds / 3600)}h${String(Math.round((seconds % 3600) / 60)).padStart(2, "0")}`}`,
          };
          next[tech.id] = { distance, mode: "approximate" };
          continue;
        }

        // Render known-city routes immediately. This is independent of OSM
        // availability and prevents the card from remaining as "—".
        const localDistance = calculateKnownCityRoute(
          tech.address || [tech.cityOriginal, tech.state].filter(Boolean).join(", "),
          getServiceDestination(svc),
        );
        if (localDistance) {
          next[tech.id] = { distance: localDistance, mode: "approximate" };
          continue;
        }

        pendingRemoteCalculations.push(tech);
      }

      // Publish every deterministic local route in a single state update
      // before any slower lookup begins. A failed lookup elsewhere must not
      // erase routes such as Registro/SP â†’ PaulÃ­nia/SP.
      if (!cancelled) setRoutes({ ...next });

      const calculations = pendingRemoteCalculations.map((tech) =>
        calculateApproximateRoute(tech, svc).then((distance) => {
          next[tech.id] = { distance, mode: "approximate" };
          if (!cancelled) setRoutes({ ...next });
        }),
      );

      // Results that use the built-in Brazilian city coordinates appear as
      // soon as they are ready. A slow external lookup must not hide those
      // ready routes from the "Outras localidades" cards.
      await Promise.race([
        Promise.allSettled(calculations),
        new Promise<void>((resolve) => setTimeout(resolve, 15000)),
      ]);

      if (!cancelled) {
        setRoutes({ ...next });
        setLoadingRoutes(false);
      }
    }

    loadAll();
    return () => { cancelled = true; };
  }, [service, technicians]);

  const { withinRange, distantes } = useMemo(() => {
    const within: ScoredTechnician[] = [];
    const far: ScoredTechnician[] = [];
    for (const s of scored) {
      const route = routes[s.technician.id];
      const isSameUf = s.category === "mesma_uf" || s.category === "recomendados";
      if (route?.distance && route.distance.distanceMeters > MAX_ROUTE_METERS && !isSameUf) {
        far.push(s);
      } else {
        within.push(s);
      }
    }
    return { withinRange: within, distantes: far };
  }, [scored, routes]);

  const grouped = useMemo(() => {
    const g: Record<string, ScoredTechnician[]> = {
      recomendados: [],
      mesma_uf: [],
      confirmar: [],
      sem_material: [],
      outras: [],
    };
    for (const s of withinRange) {
      g[s.category].push(s);
    }
    for (const cat of Object.keys(g)) {
      g[cat].sort((a, b) => {
        const routeA = routes[a.technician.id];
        const routeB = routes[b.technician.id];
        if (routeA?.distance && routeB?.distance) {
          return routeA.distance.distanceMeters - routeB.distance.distanceMeters;
        }
        return 0;
      });
    }
    return g;
  }, [withinRange, routes]);

  function handleAssign(tech: Technician) {
    if (!service) return;
    const load = loads.get(tech.id) ?? 0;
    const available = tech.availableQuantity ?? 0;
    if (
      tech.stockStatus === "SEM_MATERIAL" ||
      (tech.availableQuantity !== null && available - load <= 0)
    ) {
      toast.warning("Este técnico pode não possuir material suficiente para este atendimento.");
    }
    store.assign(service.id, tech.id, dates[service.id], times[service.id]);
    toast.success(`Atribuído para ${tech.firstName || tech.nameOriginal}.`);
  }

  function openMessage(tech: Technician, mode: "single" | "group") {
    setMessageTech(tech);
    setMessageMode(mode);
  }

  const messageText = useMemo(() => {
    if (!messageTech) return "";
    if (messageMode === "single" && service) {
      return buildTechnicianMessage(messageTech, {
        service,
        scheduledDate: dates[service.id],
        scheduledTime: times[service.id],
      });
    }
    if (messageMode === "group") {
      const techAssignments = store.assignments.filter((a) => a.technicianId === messageTech.id);
      const ctxs = techAssignments.flatMap((a) => {
        const s = store.confirmedServices.find((x) => x.id === a.serviceId);
        if (!s) return [];
        return [{ service: s, scheduledDate: a.scheduledDate, scheduledTime: a.scheduledTime }];
      });
      return buildGroupedTechnicianMessage(messageTech, ctxs);
    }
    return "";
  }, [messageTech, messageMode, service, dates, times, store.assignments, store.confirmedServices]);

  const messagePhoneValue = useMemo(() => {
    if (!messageTech) return null;
    const val =
      messageTech.phoneNormalized ??
      messageTech.allPhones?.[0] ??
      messageTech.phoneOriginal ??
      null;
    return val;
  }, [messageTech]);

  function renderTechnicianRow(t: Technician, reasons: string[], showApproximateLabel = false) {
    const load = loads.get(t.id) ?? 0;
    const isAssigned = currentAssignment?.technicianId === t.id;
    const calculatedRoute = routes[t.id];
    // Keep a deterministic address-based fallback in the rendered card. This
    // protects valid local routes if a separate asynchronous lookup times out.
    const localFallback = service
      ? calculateKnownCityRoute(
          t.address || [t.cityOriginal, t.state].filter(Boolean).join(", "),
          getServiceDestination(service),
        )
      : null;
    // Covers short client addresses such as "Registro - SP, 11900-000",
    // where imported city metadata is blank but the city is clearly present.
    const technicianKey = t.cityOriginal && t.state
      ? `${normalize(t.cityOriginal).toLocaleLowerCase("pt-BR")}, ${t.state.toLocaleLowerCase("pt-BR")}`
      : null;
    const serviceKey = service ? cityKeyFromAddress(service.fullAddress) : null;
    const technicianCoordinates = technicianKey ? brCityCoords[technicianKey] : null;
    const serviceCoordinates = serviceKey ? brCityCoords[serviceKey] : null;
    const addressFallback = technicianCoordinates && serviceCoordinates
      ? (() => {
          const meters = Math.max(1000, Math.round(haversineMeters(technicianCoordinates, serviceCoordinates) * 1.75));
          const seconds = Math.round((meters / 1000 / 75) * 3600);
          return {
            distanceMeters: meters,
            distanceText: `~${Math.round(meters / 1000)} km`,
            durationText: seconds < 3600
              ? `~${Math.max(1, Math.round(seconds / 60))} min`
              : `~${Math.floor(seconds / 3600)}h${String(Math.round((seconds % 3600) / 60)).padStart(2, "0")}`,
          };
        })()
      : null;
    const hasInconsistentShortEstimate =
      calculatedRoute?.mode === "approximate" &&
      calculatedRoute.distance &&
      addressFallback &&
      calculatedRoute.distance.distanceMeters < addressFallback.distanceMeters * 0.45;
    // Do not replace normal calculations. This only guards the misleading
    // "~1 km" case caused by two different addresses falling onto the same
    // fallback coordinate (for example Rio de Janeiro/RJ versus Itaguaí/RJ).
    const route = calculatedRoute?.mode === "exact"
      ? calculatedRoute
      : hasInconsistentShortEstimate
        ? { distance: addressFallback!, mode: "approximate" as RouteMode }
        : calculatedRoute?.distance
          ? calculatedRoute
          : localFallback
            ? { distance: localFallback, mode: "approximate" as RouteMode }
            : addressFallback
              ? { distance: addressFallback, mode: "approximate" as RouteMode }
              : calculatedRoute;
    const techAssignments = store.assignments.filter((a) => a.technicianId === t.id);
    return (
      <li
        key={t.id}
        className="p-3 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_140px_auto] md:items-center gap-2 md:gap-4"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{t.nameOriginal}</span>
            <Badge variant="outline" className="text-[10px]">
              {t.cityOriginal || "—"}/{t.state || "—"}
            </Badge>
            {t.address && (
              <span className="text-[10px] text-muted-foreground truncate max-w-[200px]" title={t.address}>
                {t.address}
              </span>
            )}
            <Badge
              variant={
                t.stockStatus === "DISPONIVEL"
                  ? "default"
                  : t.stockStatus === "SEM_MATERIAL"
                    ? "destructive"
                    : "secondary"
              }
              className="text-[10px]"
            >
              {stockStatusLabel(t.stockStatus)}
            </Badge>
            {load > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                {load} na sessão
              </Badge>
            )}
            {isAssigned && (
              <Badge variant="default" className="text-[10px]">
                Selecionado
              </Badge>
            )}
            {route?.mode === "approximate" && route.distance && (
              <Badge variant="secondary" className="text-[10px]">
                {route.distance.distanceText}
              </Badge>
            )}
            {route?.mode === "exact" && route.distance && (
              <Badge variant="default" className="text-[10px]">
                {route.distance.distanceText}
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {formatPhoneForDisplay(t.phoneNormalized)} · {reasons.join(" · ")}
          </div>
        </div>
        <div className="md:text-right">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {route?.mode === "exact" ? "Rota (Google)" : route?.mode === "approximate" || showApproximateLabel ? "Rota (aprox.)" : "Distância"}
          </div>
          <div className="text-sm font-semibold tabular-nums">
            {route?.distance
              ? route.mode === "exact"
                ? route.distance.distanceText
                : route.distance.distanceText
              : loadingRoutes
                ? "Calculando..."
                : "—"}
          </div>
          {route?.distance && (
            <div className="text-xs text-muted-foreground tabular-nums">
              {route.distance.durationText}
            </div>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            variant={isAssigned ? "secondary" : "default"}
            onClick={() => handleAssign(t)}
          >
            {isAssigned ? "Selecionado" : "Selecionar"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => openMessage(t, "single")}
          >
            <MessageCircle className="w-4 h-4 mr-1" /> Mensagem
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a
              href={buildGoogleMapsRouteUrl(t, service!)}
              target="_blank"
              rel="noreferrer"
            >
              <Map className="w-4 h-4 mr-1" /> Maps
            </a>
          </Button>
          {techAssignments.length > 1 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => openMessage(t, "group")}
            >
              Agrupado ({techAssignments.length})
            </Button>
          )}
        </div>
      </li>
    );
  }

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Distribuição de atendimentos</h1>
        <p className="text-sm text-muted-foreground">
          Selecione um atendimento e escolha um técnico. As sugestões consideram localidade e
          material.
        </p>
      </div>

      {store.confirmedServices.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Importe cliente com endereço e contatos aos técnicos para começar.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-base">
                Clientes com endereço ({store.confirmedServices.length})
              </CardTitle>
              <div className="mt-2 space-y-2">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os status</SelectItem>
                    <SelectItem value="AGENDADO">AGENDADO</SelectItem>
                    <SelectItem value="AGENDANDO">AGENDANDO</SelectItem>
                    <SelectItem value="AGENDAR">AGENDAR</SelectItem>
                  </SelectContent>
                </Select>
                <div className="space-y-1">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={matrizFilter === "all"}
                    onChange={() => setMatrizFilter("all")}
                    className="accent-primary"
                  />
                  Todas as matrizes
                </label>
                {Array.from(
                  new Set(
                    store.confirmedServices.map((s) => s.matrizOriginal).filter((m): m is string => !!m)
                  )
                ).sort().map((m) => {
                  const checked = matrizFilter !== "all" && matrizFilter !== "none" && matrizFilter.has(m);
                  return (
                    <label key={m} className="flex items-center gap-2 text-xs cursor-pointer ml-2">
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
                {store.confirmedServices.some((s) => !s.matrizOriginal) && (
                  <label className="flex items-center gap-2 text-xs cursor-pointer ml-2">
                    <input
                      type="checkbox"
                      checked={matrizFilter !== "all" && matrizFilter !== "none" && matrizFilter.has("__sem_matriz__")}
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
              <Input
                type="text"
                placeholder="Pesquisar por condutor ou placa..."
                value={clientSearchQuery}
                onChange={(e) => setClientSearchQuery(e.target.value)}
                className="h-8 text-xs mt-2"
              />
            </div>
            </CardHeader>
            <CardContent className="p-0 max-h-[70vh] overflow-y-auto">
              <ul className="divide-y">
                {store.confirmedServices
                  .filter((s) => {
                    if (statusFilter !== "all" && s.serviceStatus !== statusFilter) return false;
                    return true;
                  })
                  .filter((s) => {
                    if (matrizFilter === "all") return true;
                    if (matrizFilter === "none") return false;
                    const m = s.matrizOriginal || "__sem_matriz__";
                    return matrizFilter.has(m);
                  })
                  .filter((s) => {
                    if (!clientSearchQuery.trim()) return true;
                    const q = clientSearchQuery.trim().toLowerCase();
                    const name = (s.responsibleOriginal || "").toLowerCase();
                    const plate = (s.plateOriginal || "").toLowerCase();
                    const addr = (s.fullAddress || "").toLowerCase();
                    return name.includes(q) || plate.includes(q) || addr.includes(q);
                  })
                  .map((s) => {
                  const a = store.assignments.find((x) => x.serviceId === s.id);
                  return (
                    <li
                      key={s.id}
                      className={`p-3 cursor-pointer hover:bg-muted/40 ${
                        selectedServiceId === s.id ? "bg-muted" : ""
                      }`}
                      onClick={() => setSelectedServiceId(s.id)}
                    >
                      <div className="font-mono text-xs font-semibold">
                        {s.plateOriginal || "—"}
                      </div>
                      <div className="text-sm">{s.responsibleOriginal || "—"}</div>
                      {s.matrizOriginal && (
                        <div className="text-[11px] text-muted-foreground/70">
                          Matriz: {s.matrizOriginal}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground">
                        {s.cityDetected || "—"}/{s.stateDetected || "—"}
                      </div>
                      <div className="flex gap-1 mt-1 flex-wrap">
                        <Badge variant="outline" className="text-[10px]">
                          {equipmentLabel(s.equipmentNormalized)}
                        </Badge>
                        {a ? (
                          <Badge variant="default" className="text-[10px]">
                            {technicians.find((t) => t.id === a.technicianId)?.firstName ??
                              "Atribuído"}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">
                            Não atribuído
                          </Badge>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          <div className="lg:col-span-2 space-y-4">
            {service ? (
              <>
                <ServiceDetails
                  service={service}
                  date={dates[service.id] ?? ""}
                  time={times[service.id] ?? ""}
                  onDate={(v) => setDates((d) => ({ ...d, [service.id]: v }))}
                  onTime={(v) => setTimes((d) => ({ ...d, [service.id]: v }))}
                  onUnassign={() => {
                    store.unassign(service.id);
                    toast.success("Atribuição removida.");
                  }}
                  hasAssignment={!!currentAssignment}
                />

                <Alert>
                  <Info className="w-4 h-4" />
                  <AlertDescription className="text-xs">
                    Distâncias aproximadas (∼) calculadas automaticamente sem custo.
                    Recomendados até 900 km. Confirme disponibilidade com o técnico.
                  </AlertDescription>
                </Alert>

                {technicians.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center text-muted-foreground">
                      Importe contatos aos técnicos para gerar recomendações.
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    {(Object.keys(grouped) as (keyof typeof grouped)[]).map((cat) =>
                      grouped[cat].length === 0 ? null : (
                        <Card key={cat}>
                          <CardHeader className="py-3">
                            <CardTitle className="text-sm">{CATEGORY_LABEL[cat]}</CardTitle>
                          </CardHeader>
                          <CardContent className="p-0">
                            <ul className="divide-y">
                              {grouped[cat].map(({ technician: t, reasons }) =>
                                renderTechnicianRow(t, reasons, cat === "outras"),
                              )}
                            </ul>
                          </CardContent>
                        </Card>
                      ),
                    )}

                    {distantes.length > 0 && (
                      <Card>
                        <CardHeader className="py-3">
                          <CardTitle className="text-sm flex items-center gap-2">
                            Distantes (&gt;900 km)
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setShowDistantes(!showDistantes)}
                            >
                              {showDistantes ? "Ocultar" : `Mostrar (${distantes.length})`}
                            </Button>
                          </CardTitle>
                        </CardHeader>
                        {showDistantes && (
                          <CardContent className="p-0">
                            <ul className="divide-y">
                              {distantes.map(({ technician: t, reasons }) =>
                                renderTechnicianRow(t, reasons),
                              )}
                            </ul>
                          </CardContent>
                        )}
                      </Card>
                    )}
                  </>
                )}
              </>
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  Selecione um atendimento à esquerda.
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {messageTech && (
        <MessageDialog
          open={messageTech !== null}
          onOpenChange={(v) => !v && setMessageTech(null)}
          message={messageText}
          phone={messagePhoneValue}
          title={`Mensagem para ${messageTech.firstName || messageTech.nameOriginal}`}
        />
      )}
    </div>
  );
}

function ServiceDetails({
  service,
  date,
  time,
  onDate,
  onTime,
  onUnassign,
  hasAssignment,
}: {
  service: ConfirmedService;
  date: string;
  time: string;
  onDate: (v: string) => void;
  onTime: (v: string) => void;
  onUnassign: () => void;
  hasAssignment: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2 flex-wrap justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="font-mono">{service.plateOriginal || "—"}</span>
            <Badge variant="outline">{equipmentLabel(service.equipmentNormalized)}</Badge>
          </CardTitle>
          {hasAssignment && (
            <Button variant="ghost" size="sm" onClick={onUnassign}>
              <Undo2 className="w-4 h-4 mr-1" /> Desfazer atribuição
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="text-sm space-y-2">
        <div>
          <b>Responsável:</b> {service.responsibleOriginal || "—"}
        </div>
        <div>
          <b>Telefone:</b>{" "}
          {formatPhoneForDisplay(service.phoneNormalized) || service.phoneOriginal || "—"}
        </div>
        <div>
          <b>Endereço:</b> {service.fullAddress || "—"}
        </div>
        <div>
          <b>Cidade/UF:</b> {service.cityDetected || "—"} / {service.stateDetected || "—"}
        </div>
        {service.validationIssues.length > 0 && (
          <div className="text-xs text-amber-600 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> {service.validationIssues.join(" · ")}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <div>
            <Label className="text-xs">Data desejada</Label>
            <Input value={date} onChange={(e) => onDate(e.target.value)} placeholder="ex: 15/07" />
          </div>
          <div>
            <Label className="text-xs">Horário desejado</Label>
            <Input value={time} onChange={(e) => onTime(e.target.value)} placeholder="ex: 14:00" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
