import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, MessageCircle, Undo2, Info } from "lucide-react";
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
  calculateTechnicianRoute,
  type RouteDistance,
} from "@/services/distance";
import type { ConfirmedService, Technician } from "@/types";

const searchSchema = z.object({
  serviceId: z.string().optional(),
});

export const Route = createFileRoute("/distribuicao")({
  validateSearch: searchSchema,
  component: DistributionPage,
});

const CATEGORY_LABEL: Record<ScoredTechnician["category"], string> = {
  recomendados: "Recomendados",
  mesma_uf: "Mesma UF",
  confirmar: "Necessitam confirmação",
  sem_material: "Sem material",
  outras: "Outras localidades",
};

const MAX_ROUTE_METERS = 350_000;
const ROUTE_STATE_KEY = "creare_routes_by_service_v2";

type RoutesByService = Record<string, Record<string, RouteDistance | null>>;

function loadPersistedRoutes(): RoutesByService {
  try {
    const raw = localStorage.getItem(ROUTE_STATE_KEY);
    return raw ? (JSON.parse(raw) as RoutesByService) : {};
  } catch {
    return {};
  }
}

function persistRoutes(all: RoutesByService) {
  try {
    localStorage.setItem(ROUTE_STATE_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

function DistributionPage() {
  const store = useAppStore();
  const { serviceId: initialId } = Route.useSearch();
  const [selectedServiceId, setSelectedServiceId] = useState<string | undefined>(initialId);
  const [dates, setDates] = useState<Record<string, string>>({});
  const [times, setTimes] = useState<Record<string, string>>({});
  const [messageTech, setMessageTech] = useState<Technician | null>(null);
  const [messageMode, setMessageMode] = useState<"single" | "group">("single");
  const [routesByService, setRoutesByService] = useState<RoutesByService>(() =>
    loadPersistedRoutes(),
  );

  const service = useMemo(
    () => store.confirmedServices.find((s) => s.id === selectedServiceId),
    [selectedServiceId, store.confirmedServices],
  );

  const loads = useMemo(() => getSessionLoads(store.assignments), [store.assignments]);

  const scored = useMemo(() => {
    if (!service) return [];
    return rankTechnicians(store.technicians, service, loads);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service?.id, store.technicians, loads]);

  const routes = useMemo<Record<string, RouteDistance | null>>(
    () => (service ? (routesByService[service.id] ?? {}) : {}),
    [routesByService, service],
  );

  const grouped = useMemo(() => {
    const g: Record<ScoredTechnician["category"], ScoredTechnician[]> = {
      recomendados: [],
      mesma_uf: [],
      confirmar: [],
      sem_material: [],
      outras: [],
    };
    for (const s of scored) {
      const route = routes[s.technician.id];
      // Hide technicians confirmed to be over the max distance.
      if (route && route.distanceMeters > MAX_ROUTE_METERS) continue;
      g[s.category].push(s);
    }
    return g;
  }, [scored, routes]);

  const sortedGrouped = useMemo(() => {
    const sorted: Record<ScoredTechnician["category"], ScoredTechnician[]> = {
      recomendados: [],
      mesma_uf: [],
      confirmar: [],
      sem_material: [],
      outras: [],
    };

    for (const category of Object.keys(grouped) as ScoredTechnician["category"][]) {
      sorted[category] = [...grouped[category]].sort((a, b) => {
        const routeA = routes[a.technician.id];
        const routeB = routes[b.technician.id];
        const statusA = routeA ? 0 : a.technician.id in routes ? 2 : 1;
        const statusB = routeB ? 0 : b.technician.id in routes ? 2 : 1;
        if (statusA !== statusB) return statusA - statusB;
        if (routeA && routeB) return routeA.distanceMeters - routeB.distanceMeters;
        return 0;
      });
    }

    return sorted;
  }, [grouped, routes]);

  const currentAssignment = useMemo(
    () => (service ? store.assignments.find((a) => a.serviceId === service.id) : undefined),
    [service, store.assignments],
  );

  // Fetch route distances once per service, persisting results so that
  // clicking around the page or reassigning does not re-hit the API.
  useEffect(() => {
    if (!service) return;
    const serviceId = service.id;
    const technicians = store.technicians;
    if (technicians.length === 0) return;

    let cancelled = false;

    async function loadRoutes() {
      for (const technician of technicians) {
        if (cancelled) return;
        // Read the latest snapshot to skip anything already fetched.
        const already = (loadPersistedRoutes()[serviceId] ?? {});
        if (technician.id in already) continue;

        const route = await calculateTechnicianRoute(technician, service!);
        if (cancelled) return;

        setRoutesByService((current) => {
          const next: RoutesByService = {
            ...current,
            [serviceId]: { ...(current[serviceId] ?? {}), [technician.id]: route },
          };
          persistRoutes(next);
          return next;
        });
        await new Promise((resolve) => window.setTimeout(resolve, 1100));
      }
    }

    loadRoutes();
    return () => {
      cancelled = true;
    };
  }, [service, store.technicians]);

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
            </CardHeader>
            <CardContent className="p-0 max-h-[70vh] overflow-y-auto">
              <ul className="divide-y">
                {store.confirmedServices.map((s) => {
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
                      <div className="text-xs text-muted-foreground">
                        {s.cityDetected || "—"}/{s.stateDetected || "—"}
                      </div>
                      <div className="flex gap-1 mt-1 flex-wrap">
                        <Badge variant="outline" className="text-[10px]">
                          {equipmentLabel(s.equipmentNormalized)}
                        </Badge>
                        {a ? (
                          <Badge variant="default" className="text-[10px]">
                            {store.technicians.find((t) => t.id === a.technicianId)?.firstName ??
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
                    A recomendação é apenas uma sugestão. A distância automática usa rota por carro
                    via Google quando a chave da API está configurada. Confirme a disponibilidade e
                    os equipamentos diretamente com o técnico.
                  </AlertDescription>
                </Alert>

                {store.technicians.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center text-muted-foreground">
                      Importe contatos aos técnicos para gerar recomendações.
                    </CardContent>
                  </Card>
                ) : (
                  (Object.keys(sortedGrouped) as ScoredTechnician["category"][]).map((cat) =>
                    sortedGrouped[cat].length === 0 ? null : (
                      <Card key={cat}>
                        <CardHeader className="py-3">
                          <CardTitle className="text-sm">{CATEGORY_LABEL[cat]}</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                          <ul className="divide-y">
                            {sortedGrouped[cat].map(({ technician: t, reasons }) => {
                              const load = loads.get(t.id) ?? 0;
                              const isAssigned = currentAssignment?.technicianId === t.id;
                              const route = routes[t.id];
                              const techAssignments = store.assignments.filter(
                                (a) => a.technicianId === t.id,
                              );
                              return (
                                <li
                                  key={t.id}
                                  className="p-3 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_120px_auto] md:items-center gap-2 md:gap-4"
                                >
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-medium">{t.nameOriginal}</span>
                                      <Badge variant="outline" className="text-[10px]">
                                        {t.cityOriginal || "—"}/{t.state || "—"}
                                      </Badge>
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
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-1">
                                      {formatPhoneForDisplay(t.phoneNormalized)} ·{" "}
                                      {reasons.join(" · ")}
                                    </div>
                                  </div>
                                  <div className="md:text-right">
                                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                      Rota
                                    </div>
                                    <div className="text-sm font-semibold tabular-nums">
                                      {t.id in routes
                                        ? route === null
                                          ? "Indisponível"
                                          : route.distanceText
                                        : "Calculando..."}
                                    </div>
                                    {route && (
                                      <div className="text-xs text-muted-foreground tabular-nums">
                                        {route.durationText}
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
                                        href={buildGoogleMapsRouteUrl(t, service)}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        Ver rota no Maps
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
                            })}
                          </ul>
                        </CardContent>
                      </Card>
                    ),
                  )
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
          phone={
            messageTech.phoneNormalized ??
            messageTech.allPhones?.[0] ??
            messageTech.phoneOriginal ??
            null
          }
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
