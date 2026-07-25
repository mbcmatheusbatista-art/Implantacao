import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarDays, Filter, MessageCircle } from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { MessageDialog } from "@/components/message-dialog";
import { equipmentLabel } from "@/utils/normalize-equipment";
import type { ConfirmedService } from "@/types";

export const Route = createFileRoute("/agendamentos")({
  component: AgendamentosPage,
});

const STATUS_OPTIONS = ["AGENDADO", "AGENDANDO", "AGENDAR"] as const;

type StatusOverrides = Record<string, (typeof STATUS_OPTIONS)[number]>;

function AgendamentosPage() {
  const store = useAppStore();
  const services = store.confirmedServices;
  const technicians = store.technicians;


  const [statusOverrides, setStatusOverrides] = useState<StatusOverrides>({});
  const [selectedTechFilter, setSelectedTechFilter] = useState<string>("all");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>("all");
  const [hiddenTechs, setHiddenTechs] = useState<Set<string>>(new Set());
  const [includeAgendando, setIncludeAgendando] = useState(true);
  const [messageTech, setMessageTech] = useState<{
    tech: typeof technicians[number];
    text: string;
  } | null>(null);

  const techMap = useMemo(() => {
    const byName = new Map<string, typeof technicians[number]>();
    const byId = new Map<string, typeof technicians[number]>();
    for (const t of technicians) {
      byId.set(t.id, t);
      const key = t.nameOriginal.toLowerCase().trim();
      const existing = byName.get(key);
      if (!existing) {
        byName.set(key, t);
      } else {
        const existingPhone = existing.phoneNormalized ?? existing.allPhones?.[0] ?? existing.phoneOriginal;
        const newPhone = t.phoneNormalized ?? t.allPhones?.[0] ?? t.phoneOriginal;
        if (!existingPhone && newPhone) {
          byName.set(key, t);
        } else if (existingPhone && !newPhone) {
          const merged = { ...existing };
          if (t.phoneOriginal && !existing.phoneOriginal) merged.phoneOriginal = t.phoneOriginal;
          if (t.phoneNormalized && !existing.phoneNormalized) merged.phoneNormalized = t.phoneNormalized;
          if (t.allPhones?.length) {
            merged.allPhones = [...new Set([...existing.allPhones, ...t.allPhones])];
          }
          byName.set(key, merged);
        }
      }
    }
    return { byName, byId };
  }, [technicians]);

  const uniqueTechOptions = useMemo(() => {
    const names = new Set<string>();
    const list: { label: string; value: string }[] = [];
    for (const s of services) {
      const name = s.technicianOriginal?.trim();
      if (!name || names.has(name.toLowerCase()) || hiddenTechs.has(name.toLowerCase())) continue;
      names.add(name.toLowerCase());
      const match = techMap.byName.get(name.toLowerCase());
      list.push({
        label: match ? `${name} — ${match.cityOriginal}/${match.state}` : name,
        value: match ? `tech_${match.id}` : `name_${name}`,
      });
    }
    for (const t of technicians) {
      const key = t.nameOriginal.toLowerCase();
      if (names.has(key) || hiddenTechs.has(key)) continue;
      names.add(key);
      list.push({
        label: `${t.nameOriginal} — ${t.cityOriginal}/${t.state}`,
        value: `tech_${t.id}`,
      });
    }
    list.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
    return list;
  }, [services, techMap, hiddenTechs]);

  function getEffectiveStatus(svc: ConfirmedService): (typeof STATUS_OPTIONS)[number] {
    const override = statusOverrides[svc.id];
    if (override) return override;
    const fromService = svc.serviceStatus?.toUpperCase();
    if (fromService === "AGENDADO" || fromService === "AGENDANDO" || fromService === "AGENDAR") {
      return fromService;
    }
    return "AGENDAR";
  }

  const fmtRe = /\u200BFORMAT:(green|red|orange)\u200B/g;
  function cl(text: string | null | undefined): string {
    if (!text) return "";
    return text.replace(fmtRe, "").trim();
  }

  function getDataHora(svc: ConfirmedService): string {
    return cl(svc.dataHora);
  }

  function getStatusDisplay(svc: ConfirmedService): string {
    const cleaned = cl(svc.serviceStatusOriginal);
    return cleaned || getEffectiveStatus(svc);
  }

  const uniqueStatusOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of services) {
      const display = getStatusDisplay(s);
      if (display) set.add(display);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [services]);

  function namesMatch(a: string, b: string): boolean {
    const x = a.toLowerCase().trim();
    const y = b.toLowerCase().trim();
    if (x === y) return true;
    if (x.includes(y) || y.includes(x)) return true;
    return false;
  }

  function resolveTech(value: string): typeof technicians[number] | null {
    if (value.startsWith("tech_")) {
      const id = value.slice(5);
      return techMap.byId.get(id) ?? null;
    }
    if (value.startsWith("name_")) {
      const name = value.slice(5);
      const exact = techMap.byName.get(name.toLowerCase().trim());
      if (exact) return exact;
      for (const [key, tech] of techMap.byName) {
        if (namesMatch(name, key)) return tech;
      }
      return null;
    }
    return null;
  }

  function resolveTechName(value: string): string {
    if (value.startsWith("tech_") || value.startsWith("name_")) {
      const raw = value.slice(5);
      const tech = resolveTech(value);
      return tech?.nameOriginal || raw;
    }
    return value;
  }

  function hasAddress(svc: ConfirmedService): boolean {
    return !!(svc.fullAddress && svc.fullAddress.trim().length > 0);
  }

  function filterByTech(svc: ConfirmedService, value: string): boolean {
    const svcName = svc.technicianOriginal?.toLowerCase().trim() || "";
    if (!svcName) return false;
    if (value.startsWith("tech_")) {
      const tech = resolveTech(value);
      return tech ? namesMatch(svcName, tech.nameOriginal) : false;
    }
    if (value.startsWith("name_")) {
      return namesMatch(svcName, value.slice(5));
    }
    return namesMatch(svcName, value);
  }

  const filteredServices = useMemo(() => {
    let result = [...services];
    result = result.filter((s) => {
      const name = s.technicianOriginal?.toLowerCase().trim();
      return !(name && hiddenTechs.has(name));
    });
    if (selectedTechFilter !== "all") {
      result = result.filter((s) => filterByTech(s, selectedTechFilter));
    }
    if (selectedStatusFilter !== "all") {
      result = result.filter((s) => getStatusDisplay(s) === selectedStatusFilter);
    }
    result = result.filter((s) => {
      if (getEffectiveStatus(s) === "AGENDADO" && !hasAddress(s)) return false;
      return true;
    });
    return result;
  }, [services, selectedTechFilter, selectedStatusFilter, statusOverrides, hiddenTechs]);

  const selectedTechObj = useMemo(() => {
    if (selectedTechFilter === "all") return null;
    return resolveTech(selectedTechFilter);
  }, [selectedTechFilter, techMap]);

  const messageServices = useMemo(() => {
    if (selectedTechFilter === "all") return [];
    let result = [...services];
    result = result.filter((s) => {
      const name = s.technicianOriginal?.toLowerCase().trim();
      return !(name && hiddenTechs.has(name));
    });
    result = result.filter((s) => filterByTech(s, selectedTechFilter));
    result = result.filter((s) => {
      if (getEffectiveStatus(s) === "AGENDADO" && !hasAddress(s)) return false;
      return true;
    });
    result = result.filter((s) => {
      const st = getEffectiveStatus(s);
      if (st === "AGENDADO") return true;
      if (st === "AGENDANDO" && includeAgendando) return true;
      return false;
    });
    return result;
  }, [services, selectedTechFilter, hiddenTechs, statusOverrides, includeAgendando]);

  function buildMessageText(): string {
    if (messageServices.length === 0) return "";

    const blocks = Object.entries(
      messageServices.reduce<Record<string, typeof messageServices>>((acc, s) => {
        const st = getEffectiveStatus(s);
        if (!acc[st]) acc[st] = [];
        acc[st].push(s);
        return acc;
      }, {})
    )
      .map(([status, list]) => {
        const title = `*${status}*`;
        const lines = list.map(
          (s) =>
            `*${s.plateOriginal || "—"}*  |  ${getDataHora(s) || "sem data"}  |  ${s.fullAddress}  |  ${equipmentLabel(s.equipmentNormalized)}`
        );
        return [title, "", ...lines].join("\n");
      })
      .join("\n\n");
    return blocks;
  }

  function handleOpenWhatsApp() {
    if (selectedTechFilter === "all") {
      toast.error("Selecione um técnico específico para enviar WhatsApp.");
      return;
    }
    const tech = selectedTechObj;
    const techName = resolveTechName(selectedTechFilter);
    const text = buildMessageText();
    setMessageTech({
      tech: tech || { firstName: techName, nameOriginal: techName } as typeof technicians[number],
      text,
    });
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Agendamentos</h1>
        <p className="text-muted-foreground mt-1">
          Visualize e gerencie os atendimentos do "Cliente com endereço" por técnico e status.
          O telefone do técnico vem do "Contatar aos técnicos".
        </p>
      </div>

      {services.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhum dado encontrado. Importe "Cliente com endereço" e "Contatar aos técnicos" para começar.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Filter className="w-4 h-4" />
                Filtros
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Técnico(a)</Label>
                <Select value={selectedTechFilter} onValueChange={setSelectedTechFilter}>
                  <SelectTrigger className="w-72">
                    <SelectValue placeholder="Todos os técnicos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os técnicos</SelectItem>
                    {uniqueTechOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select value={selectedStatusFilter} onValueChange={setSelectedStatusFilter}>
                  <SelectTrigger className="w-56">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {uniqueStatusOptions.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedTechFilter("all");
                    setSelectedStatusFilter("all");
                  }}
                >
                  Limpar filtros
                </Button>
                {selectedTechFilter !== "all" && (
                  <>
                    <label className="flex items-center gap-1 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeAgendando}
                        onChange={(e) => setIncludeAgendando(e.target.checked)}
                        className="accent-primary"
                        disabled={selectedStatusFilter === "AGENDANDO"}
                      />
                      Incluir AGENDANDO
                    </label>
                    <Button onClick={handleOpenWhatsApp}>
                      <MessageCircle className="w-4 h-4 mr-2" /> WhatsApp
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarDays className="w-4 h-4" />
                Agendado{selectedTechFilter !== "all" ? ` — ${resolveTechName(selectedTechFilter)}` : ""}
                <Badge variant="outline">{filteredServices.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm border-collapse border table-fixed">
                <thead>
                  <tr className="text-left text-muted-foreground bg-muted/30">
                    <th className="py-2 px-3 font-medium border w-[130px]">STATUS</th>
                    <th className="py-2 px-3 font-medium border w-[130px]">DATA E HORA</th>
                    <th className="py-2 px-3 font-medium border w-[110px]">PLACA</th>
                    <th className="py-2 px-3 font-medium border">ENDEREÇO COMPLETO PARA ATENDIMENTO</th>
                    <th className="py-2 px-3 font-medium border w-[160px]">TÉCNICO(A)</th>
                    <th className="py-2 px-3 font-medium border w-[120px]">EQUIP</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredServices.map((svc) => (
                    <tr key={svc.id}>
                      <td className="py-2 px-3 border">
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-semibold break-words leading-tight flex-1">
                            {getStatusDisplay(svc)}
                          </span>
                          <Select
                            value={getEffectiveStatus(svc)}
                            onValueChange={(v) => {
                              setStatusOverrides((prev) => ({
                                ...prev,
                                [svc.id]: v as (typeof STATUS_OPTIONS)[number],
                              }));
                            }}
                          >
                            <SelectTrigger className="h-5 w-12 p-0 text-[8px] shrink-0">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STATUS_OPTIONS.map((opt) => (
                                <SelectItem key={opt} value={opt} className="text-xs">
                                  {opt}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </td>
                      <td className="py-2 px-3 border whitespace-nowrap text-xs">
                        {getDataHora(svc) || "—"}
                      </td>
                      <td className="py-2 px-3 border font-mono text-xs whitespace-nowrap">
                        {cl(svc.plateOriginal) || "—"}
                      </td>
                      <td className="py-2 px-3 border break-words text-xs">
                        {cl(svc.fullAddress) || "—"}
                      </td>
                      <td className="py-2 px-3 border truncate max-w-[160px]" title={cl(svc.technicianOriginal) || "—"}>
                        {cl(svc.technicianOriginal) || "—"}
                        {techMap.byName.has(cl(svc.technicianOriginal).toLowerCase()) && (
                          <span className="ml-1 text-[10px] text-green-600">✓</span>
                        )}
                      </td>
                      <td className="py-2 px-3 border whitespace-nowrap">
                        {equipmentLabel(svc.equipmentNormalized)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredServices.length === 0 && (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Nenhum atendimento encontrado com os filtros atuais.
                </p>
              )}
            </CardContent>
          </Card>

          {hiddenTechs.size > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base text-muted-foreground">
                  Técnicos removidos ({hiddenTechs.size})
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {[...hiddenTechs].map((name) => (
                  <Badge key={name} variant="secondary" className="gap-2">
                    {name}
                    <button
                      className="text-xs hover:text-primary ml-1"
                      onClick={() => {
                        const next = new Set(hiddenTechs);
                        next.delete(name);
                        setHiddenTechs(next);
                      }}
                    >
                      restaurar
                    </button>
                  </Badge>
                ))}
              </CardContent>
            </Card>
          )}

          {selectedTechFilter !== "all" && filteredServices.length > 0 && (
          <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarDays className="w-4 h-4" />
                  AGENDANDO
                </CardTitle>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    const name = resolveTechName(selectedTechFilter).toLowerCase().trim();
                    setHiddenTechs((prev) => new Set(prev).add(name));
                    setSelectedTechFilter("all");
                    toast.success("Técnico removido da lista.");
                  }}
                >
                  Remover técnico
                </Button>
              </CardHeader>
              <CardContent>
                {(() => {
                  const agendando = selectedTechFilter === "all" ? [] : services.filter(s => {
                    const name = s.technicianOriginal?.toLowerCase().trim();
                    return !(name && hiddenTechs.has(name)) && filterByTech(s, selectedTechFilter) && getEffectiveStatus(s) === "AGENDANDO";
                  });
                  return agendando.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Nenhum atendimento com status AGENDANDO.
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {agendando.map((svc) => (
                        <li key={svc.id} className="text-sm py-1 border-b last:border-0">
                          <span className="font-mono text-xs font-semibold">
                            {svc.plateOriginal || "—"}
                          </span>
                          <span className="text-muted-foreground">
                            {" "}— {getDataHora(svc) || "sem data"} — {svc.fullAddress}
                          </span>
                          <Badge variant="secondary" className="ml-2 text-[10px]">
                            {equipmentLabel(svc.equipmentNormalized)}
                          </Badge>
                        </li>
                      ))}
                  </ul>
                )})()}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {messageTech && (
        <MessageDialog
          open={messageTech !== null}
          onOpenChange={(v) => !v && setMessageTech(null)}
          message={messageTech.text}
          phone={
            selectedTechObj
              ? selectedTechObj.phoneNormalized ??
                selectedTechObj.allPhones?.[0] ??
                selectedTechObj.phoneOriginal ??
                null
              : null
          }
          title={`Mensagem para ${messageTech.tech.firstName || messageTech.tech.nameOriginal}`}
        />
      )}
    </div>
  );
}
