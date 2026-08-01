import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DateRange } from "react-day-picker";
import { MapPin, Copy, Check } from "lucide-react";
import { findFixedTechnicianLocation } from "@/services/seed-data";
import {
  findTechnicianEntryByName,
  getTechnicianCnpj,
  getTechnicianDisplayName,
} from "@/services/cnpj-register";
import { normalizeText } from "@/utils/normalize-text";
import { toast } from "sonner";

export const Route = createFileRoute("/planner")({
  component: PlannerRoute,
});

interface PlannerItemState {
  serviceId: string;
  matrix: string;
  techName: string;
  plate: string;
  isPendenteFat: boolean;
  equip: string;
  mapsLink: string;
  link: string;
  km: string;
  chamado: string;
  pedagio: string;
  address: string;
  day: string;
  customText?: string;
}

/**
 * Marcadores de filial/razão social usados para extrair o nome base da empresa.
 * Ex: "SGS FILIAL 2", "SGS LTDA" e "SGS" → a mesma empresa "SGS".
 */
const BRANCH_MARKERS_RE =
  /\b(FILIAL|FILIAIS|UNIDADE|UNIDADES|MATRIZ|LTDA|ME|EPP|EIRELI|MEI|S A|SA|CIA)\b/;

/**
 * Chave de agrupamento: o primeiro termo do nome da matriz é a empresa.
 * Ex: "SGS", "SGS DO BRASIL", "SGS ENGER" e "SGS FILIAL 2" → a mesma empresa
 * "SGS" → mesmo container. Regra genérica para qualquer empresa.
 */
const normalizeMatrixKey = (value: string) => {
  const normalized = normalizeText(value);
  const markerMatch = normalized.match(BRANCH_MARKERS_RE);
  let company = "";
  if (markerMatch) {
    company = normalized.slice(0, markerMatch.index).trim();
    if (!company) {
      company = normalized.slice((markerMatch.index ?? 0) + markerMatch[0].length);
    }
  } else {
    company = normalized;
  }
  company = company
    .replace(/^[\s\d]+/, "")
    .replace(/\s+\d+$/, "")
    .trim();
  company = company || normalized;
  return company.split(/\s+/)[0] || company;
};

function PlannerRoute() {
  const { technicians, confirmedServices, calls } = useAppStore();
  const [selectedTech, setSelectedTech] = useState<string>("");
  const [cnpj, setCnpj] = useState<string>("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [plannerItems, setPlannerItems] = useState<PlannerItemState[]>([]);
  const [valoresRS, setValoresRS] = useState<Record<string, string>>({});
  const [hasGenerated, setHasGenerated] = useState<boolean>(false);
  const [debugOutput, setDebugOutput] = useState<React.ReactNode | null>(null);

  const handleTechChange = (value: string) => {
    setSelectedTech(value);
    const tech = technicians.find((t) => t.id === value);
    if (!tech) return;
    const registeredCnpj = getTechnicianCnpj(tech);
    if (registeredCnpj) setCnpj(registeredCnpj);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  };

  const getPeriodStr = () => {
    if (!dateRange?.from) return "";
    const from = dateRange.from;
    const to = dateRange.to || dateRange.from;
    return dateRange.to && dateRange.from.getTime() !== dateRange.to.getTime()
      ? `${formatDate(from)} a ${formatDate(to)}`
      : formatDate(from);
  };

  const generatePlanner = () => {
    if (!selectedTech || !dateRange?.from) return;

    const from = dateRange.from;
    const to = dateRange.to || dateRange.from;

    const tech = technicians.find((t) => t.id === selectedTech);
    if (!tech) return;

    const selectedEntry = findTechnicianEntryByName(tech.nameOriginal || "");

    const isTechMatch = (s: (typeof confirmedServices)[number]) => {
      const candidates = [s.technicianOriginal, s.technicianNormalized];
      return candidates.some((raw) => {
        if (!raw) return false;
        const trimmed = raw.trim();
        if (!trimmed) return false;

        // Igualdade exata com o nome do técnico como aparece na lista de técnicos
        if (trimmed.toLowerCase() === (tech.nameOriginal || "").toLowerCase()) return true;

        if (selectedEntry) {
          // Resolve o técnico do serviço pelo cadastro técnico ↔ CNPJ e compara a mesma pessoa
          const serviceEntry = findTechnicianEntryByName(trimmed);
          return serviceEntry !== undefined && serviceEntry.techName === selectedEntry.techName;
        }

        // Sem cadastro: fallback por substring sobre o nome original
        const techSearch = tech.nameOriginal.toLowerCase().trim();
        const techOrig = trimmed.toLowerCase();
        const techNorm = (s.technicianNormalized || "").toLowerCase().trim();
        return (
          techOrig === techSearch ||
          techNorm === techSearch ||
          (techOrig && techSearch.includes(techOrig)) ||
          (techNorm && techSearch.includes(techNorm)) ||
          (techOrig && techOrig.includes(techSearch)) ||
          (techNorm && techNorm.includes(techSearch))
        );
      });
    };

    // Filter services
    const services = confirmedServices.filter((s) => {
      const statusOriginal = (s.serviceStatusOriginal || "").toUpperCase().trim();
      const isAgendado =
        s.serviceStatus === "AGENDADO" || /(^|[^A-Z])AGENDADO($|[^A-Z])/.test(statusOriginal);

      if (!isTechMatch(s) || !isAgendado) return false;

      if (!s.dataHora) return false;
      const match = s.dataHora.match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
      if (!match) return false;
      const day = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      const year = new Date().getFullYear();
      const d = new Date(year, month, day);

      const dTime = d.getTime();
      const fTime = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
      const tTime = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();

      return dTime >= fTime && dTime <= tTime;
    });

    console.log(
      "[PLANNER] Matrizes distintas do técnico:",
      Array.from(new Set(services.map((s) => s.matrizOriginal || "EMPRESA NÃO IDENTIFICADA")))
        .map((m) => JSON.stringify(m))
        .join(" | "),
    );

    if (services.length === 0) {
      setPlannerItems([]);
      setHasGenerated(true);

      const allForTech = confirmedServices.filter((s) => isTechMatch(s));

      const uniqueTechs = Array.from(
        new Set(
          confirmedServices.map(
            (s) => s.technicianOriginal || s.technicianNormalized || "Sem Técnico",
          ),
        ),
      )
        .slice(0, 10)
        .join(", ");

      setDebugOutput(
        <div className="text-muted-foreground p-6 whitespace-pre-wrap border border-dashed rounded-lg bg-muted/50">
          <p className="font-semibold text-destructive mb-4">
            Nenhum atendimento agendado encontrado para este técnico no período selecionado.
          </p>
          <div className="text-xs space-y-2 text-left bg-background p-4 rounded border">
            <p>
              <strong>Detalhes de Diagnóstico:</strong>
            </p>
            <p>
              Técnico selecionado: <em>{getTechnicianDisplayName(tech)}</em>
            </p>
            <p>
              Data selecionada: <em>{from.toLocaleDateString()}</em> a{" "}
              <em>{to.toLocaleDateString()}</em>
            </p>
            <p>
              Total de serviços importados ("Cliente com Endereço"):{" "}
              <strong>{confirmedServices.length}</strong>
            </p>
            <hr className="my-2" />
            <p>
              <strong>Serviços encontrados para este técnico (ignorando data e status):</strong>{" "}
              {allForTech.length}
            </p>
            {allForTech.length > 0 ? (
              <ul className="list-disc pl-4 mt-2">
                {allForTech.map((s, i) => (
                  <li key={i}>
                    Status: <strong>{s.serviceStatusOriginal || s.serviceStatus}</strong> |
                    DataHora: <strong>{s.dataHora || "vazio"}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2">
                Não foi encontrado nenhum serviço no nome deste técnico. Veja alguns técnicos na
                planilha: <br />
                <span className="text-muted-foreground">{uniqueTechs}</span>
              </p>
            )}
          </div>
        </div>,
      );
      return;
    }

    setDebugOutput(null);

    const items: PlannerItemState[] = services.map((s) => {
      const call = calls.find(
        (c) => c.plateOriginal === s.plateOriginal || c.plateNormalized === s.plateNormalized,
      );
      const fatOriginal = call?.fatOriginal?.toUpperCase().trim();
      const isPendenteFat = fatOriginal === "NÃO" || fatOriginal === "NAO";

      const fixedLocation = findFixedTechnicianLocation(tech);
      const fixedAddress = fixedLocation?.address ?? "";
      const hasUsableFixedAddress =
        Boolean(fixedAddress) && !/NAO LOCALIZADO|NAO INFORMADO/i.test(fixedAddress);
      const techAddress = hasUsableFixedAddress ? fixedAddress : tech.address;

      let mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.fullAddress)}`;
      if (techAddress) {
        mapsLink = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(techAddress)}&destination=${encodeURIComponent(s.fullAddress)}`;
      } else if (s.addressLink) {
        mapsLink = s.addressLink;
      }

      const dayParts = s.dataHora.match(/(\d{1,2})\s*\/\s*(\d{1,2})/);

      return {
        serviceId: s.id,
        matrix: normalizeMatrixKey(s.matrizOriginal || "EMPRESA NÃO IDENTIFICADA"),
        techName: getTechnicianDisplayName(tech),
        plate: s.plateOriginal,
        isPendenteFat,
        equip: call?.equipmentOriginal || s.equipmentOriginal || "N/A",
        mapsLink,
        link: "",
        km: "",
        chamado: call?.chamadoOriginal || "N/A",
        pedagio: "",
        address: s.fullAddress,
        day: dayParts ? `${dayParts[1].padStart(2, "0")}/${dayParts[2].padStart(2, "0")}` : "",
      };
    });

    setPlannerItems(items);
    setHasGenerated(true);
  };

  const updateItemField = (
    serviceId: string,
    field: "link" | "km" | "chamado" | "pedagio" | "customText",
    value: string,
  ) => {
    setPlannerItems((prev) =>
      prev.map((item) => {
        if (item.serviceId !== serviceId) return item;
        const updated = { ...item, [field]: value };
        if (field !== "customText") {
          // If we edit an input field, we reset the custom override text so it regenerates dynamically
          delete updated.customText;
        }
        return updated;
      }),
    );
  };

  /** Texto completo do primeiro chamado (empresa, técnico e rodapé incluídos). */
  const compileItemFull = (item: PlannerItemState) => {
    if (item.customText !== undefined) return item.customText;

    const kmDisplay = item.km.trim()
      ? item.km.toLowerCase().includes("km")
        ? item.km.trim()
        : `${item.km.trim()} km`
      : "";

    return `${item.matrix}

Técnico: ${item.techName}
Técnico mais próximo com disponibilidade e material do cliente.


Link: ${item.link}
Distância: ${kmDisplay}
Pedágio: ${item.pedagio}
Placa: ${item.plate.trim()} Chamado n° ${item.chamado}${item.isPendenteFat ? " Pendente anexar FAT" : ""}
Adesão de ${item.equip}`;
  };

  /** Texto único de cada chamado (sem repetir empresa, técnico e rodapé). */
  const compileItemBody = (item: PlannerItemState) => {
    if (item.customText !== undefined) return item.customText;

    const kmDisplay = item.km.trim()
      ? item.km.toLowerCase().includes("km")
        ? item.km.trim()
        : `${item.km.trim()} km`
      : "";

    return `


Link: ${item.link}
Distância: ${kmDisplay}
Pedágio: ${item.pedagio}
Placa: ${item.plate.trim()} Chamado n° ${item.chamado}${item.isPendenteFat ? " Pendente anexar FAT" : ""}
Adesão de ${item.equip}`;
  };

  /** Uma linha de placa/chamado (sem espaço na frente da placa). */
  const compilePlateLine = (item: PlannerItemState) =>
    `Placa: ${item.plate.trim()} Chamado n° ${item.chamado}${item.isPendenteFat ? " Pendente anexar FAT" : ""}`;

  /**
   * Bloco agrupado por endereço/dia: placas no mesmo endereço e no mesmo dia
   * ficam uma embaixo da outra, compartilhando link, distância e pedágio.
   */
  const compileAddressBlock = (items: PlannerItemState[], withHeader: boolean) => {
    const first = items[0];
    const kmDisplay = first.km.trim()
      ? first.km.toLowerCase().includes("km")
        ? first.km.trim()
        : `${first.km.trim()} km`
      : "";

    const header = withHeader
      ? `${first.matrix}

Técnico: ${first.techName}
Técnico mais próximo com disponibilidade e material do cliente.


`
      : "";

    // Tipos de equipamento distintos do bloco: mesmo tipo → "Adesão de X";
    // tipos diferentes → "Adesão de X + Y".
    const equips = Array.from(new Set(items.map((i) => i.equip.trim()).filter(Boolean)));
    const adesao = `Adesão de ${equips.join(" + ")}`;

    return `${withHeader ? header : "\n"}Link: ${first.link}
Distância: ${kmDisplay}
Pedágio: ${first.pedagio}
${items.map(compilePlateLine).join("\n")}
${adesao}`;
  };

  /** Texto completo do grupo: título, primeiro bloco com as informações e demais corpos. */
  const compileGroupText = (display: string, key: string, srvs: PlannerItemState[]) => {
    const rVal = valoresRS[key] ? ` R$ ${valoresRS[key]}` : "";
    const title = `${display} - ${effectiveCnpj}${rVal} - ${getPeriodStr()}`;

    let parts: string[];
    if (srvs.some((item) => item.customText !== undefined)) {
      // Texto editado manualmente: mantém o comportamento de um chamado por bloco
      parts = srvs.map((item, i) => (i === 0 ? compileItemFull(item) : compileItemBody(item)));
    } else {
      const addressKey = (item: PlannerItemState) =>
        `${item.day}|${normalizeText(item.address || "")}`;

      const blocks: PlannerItemState[][] = [];
      for (const item of srvs) {
        const existing = blocks.find((b) => b.length > 0 && addressKey(b[0]) === addressKey(item));
        if (existing) existing.push(item);
        else blocks.push([item]);
      }
      parts = blocks.map((block, i) => compileAddressBlock(block, i === 0));
    }

    return `${title}\n\n${parts.join("\n\n")}`;
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  const selectedTechnician = technicians.find((t) => t.id === selectedTech);
  const registeredCnpj = selectedTechnician ? getTechnicianCnpj(selectedTechnician) || "" : "";
  const effectiveCnpj = cnpj || registeredCnpj || "[CNPJ do Técnico]";

  const handleCopyMatrixGroup = (display: string, key: string, groupItems: PlannerItemState[]) => {
    handleCopy(compileGroupText(display, key, groupItems), "Planner da Empresa");
  };

  /** Copia todos os containers em sequência, com 3 quebras de linha entre eles. */
  const handleCopyAllContainers = () => {
    const groups = Object.entries(groupedItems);
    if (groups.length === 0) return;
    const fullText = groups
      .map(([key, group]) => compileGroupText(group.display, key, group.items))
      .join("\n\n\n");
    handleCopy(fullText, "Planner Completo");
  };

  // Group items by Matrix (chave normalizada; título exibido = primeiro nome visto)
  const groupedItems = plannerItems.reduce(
    (acc, item) => {
      const key = normalizeMatrixKey(item.matrix);
      if (!acc[key]) acc[key] = { display: item.matrix, items: [] };
      acc[key].items.push(item);
      return acc;
    },
    {} as Record<string, { display: string; items: PlannerItemState[] }>,
  );

  // Placas que aparecem em mais de um container (mesma placa com matrizes diferentes)
  const platesByContainer = new Map<string, string[]>();
  for (const group of Object.values(groupedItems)) {
    for (const item of group.items) {
      const containers = platesByContainer.get(item.plate) ?? [];
      if (!containers.includes(group.display)) containers.push(group.display);
      platesByContainer.set(item.plate, containers);
    }
  }
  const duplicatePlates = Array.from(platesByContainer.entries()).filter(
    ([, containers]) => containers.length > 1,
  );

  return (
    <div className="container p-6 mx-auto space-y-6 max-w-5xl animate-in fade-in zoom-in-95">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Criação de Planner</h1>
        <p className="text-muted-foreground mt-2">
          Selecione um técnico e as datas para gerar o planner com base nos serviços agendados.
        </p>
      </div>

      <div className="grid lg:grid-cols-[320px_1fr] gap-8">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Filtros</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Técnico</Label>
              <Select value={selectedTech} onValueChange={handleTechChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um técnico..." />
                </SelectTrigger>
                <SelectContent>
                  {technicians.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {getTechnicianDisplayName(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>CNPJ do Técnico (Opcional)</Label>
              <Input
                placeholder={
                  registeredCnpj
                    ? registeredCnpj
                    : "Ex: 00.000.000/0000-00 (preenchido automaticamente)"
                }
                value={cnpj}
                onChange={(e) => setCnpj(e.target.value)}
              />
            </div>

            <div className="space-y-2 flex flex-col">
              <Label>Período / Data</Label>
              <div className="border rounded-md self-center bg-background p-2">
                <Calendar
                  mode="range"
                  selected={dateRange}
                  onSelect={setDateRange}
                  className="rounded-md"
                />
              </div>
            </div>

            <Button
              className="w-full"
              onClick={generatePlanner}
              disabled={!selectedTech || !dateRange?.from}
            >
              Criar Planner
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Resultado</h2>
            {plannerItems.length > 0 && (
              <Button onClick={handleCopyAllContainers} className="gap-1.5">
                <Copy className="w-3.5 h-3.5" /> Copiar Planner Completo
              </Button>
            )}
          </div>

          {debugOutput}

          {plannerItems.length > 0 && (
            <div className="space-y-8">
              {duplicatePlates.length > 0 && (
                <div className="border border-amber-300 bg-amber-50 text-amber-900 rounded-lg p-4 text-sm space-y-1">
                  <p className="font-semibold">
                    Atenção — placas aparecendo em mais de um container (mesma placa com matrizes
                    diferentes na planilha):
                  </p>
                  {duplicatePlates.map(([plate, containers]) => (
                    <p key={plate} className="font-mono text-xs pl-2">
                      {plate}: {containers.map((c) => JSON.stringify(c)).join("  ⟶  ")}
                    </p>
                  ))}
                </div>
              )}
              {Object.entries(groupedItems).map(([matrixKey, group]) => {
                const matrix = group.display;
                const srvs = group.items;
                const rVal = valoresRS[matrixKey] ? ` R$ ${valoresRS[matrixKey]}` : "";
                const titleStr = `${matrix} - ${effectiveCnpj}${rVal} - ${getPeriodStr()}`;

                return (
                  <Card key={matrixKey} className="border-2 shadow-sm">
                    <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b bg-muted/40 pb-4">
                      <div>
                        <CardTitle className="text-base font-bold text-foreground">
                          {titleStr}
                        </CardTitle>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-1.5">
                          <Label
                            htmlFor={`rs-${matrixKey}`}
                            className="text-xs font-semibold shrink-0"
                          >
                            R$:
                          </Label>
                          <Input
                            id={`rs-${matrixKey}`}
                            placeholder="Valor"
                            className="w-20 h-8 text-xs bg-background"
                            value={valoresRS[matrixKey] || ""}
                            onChange={(e) =>
                              setValoresRS((prev) => ({ ...prev, [matrixKey]: e.target.value }))
                            }
                          />
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleCopyMatrixGroup(matrix, matrixKey, srvs)}
                          className="h-8 text-xs gap-1.5"
                        >
                          <Copy className="w-3.5 h-3.5" /> Copiar Tudo
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-8 pt-6">
                      {srvs.map((item, i) => {
                        const compiledText =
                          i === 0 ? compileItemFull(item) : compileItemBody(item);

                        return (
                          <div
                            key={item.serviceId}
                            className="border p-4 rounded-lg bg-card space-y-4 shadow-xs relative"
                          >
                            <div className="flex justify-between items-center">
                              <span className="text-xs font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded">
                                Chamado #{i + 1} ({item.plate})
                              </span>
                              <div className="flex gap-2">
                                <Button variant="outline" size="sm" asChild className="h-8 text-xs">
                                  <a href={item.mapsLink} target="_blank" rel="noreferrer">
                                    <MapPin className="w-3.5 h-3.5 mr-1" /> Link Maps
                                  </a>
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleCopy(compiledText, `Chamado ${item.plate}`)}
                                  className="h-8 text-xs gap-1.5"
                                >
                                  <Copy className="w-3.5 h-3.5" /> Copiar
                                </Button>
                              </div>
                            </div>

                            {/* Inputs para Edição Rápida */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-muted/20 p-3 rounded-md border text-sm">
                              <div className="space-y-1">
                                <Label className="text-xs font-semibold">Link do Google Maps</Label>
                                <Input
                                  placeholder="Cole o link customizado..."
                                  className="h-8 text-xs bg-background"
                                  value={item.link}
                                  onChange={(e) =>
                                    updateItemField(item.serviceId, "link", e.target.value)
                                  }
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs font-semibold">Kilometragem (Km)</Label>
                                <Input
                                  placeholder="Ex: 45km"
                                  className="h-8 text-xs bg-background"
                                  value={item.km}
                                  onChange={(e) =>
                                    updateItemField(item.serviceId, "km", e.target.value)
                                  }
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs font-semibold">Chamado nº</Label>
                                <Input
                                  placeholder="Número do chamado..."
                                  className="h-8 text-xs bg-background"
                                  value={item.chamado}
                                  onChange={(e) =>
                                    updateItemField(item.serviceId, "chamado", e.target.value)
                                  }
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs font-semibold">Pedágio (R$)</Label>
                                <Input
                                  placeholder="Ex: 12,50"
                                  className="h-8 text-xs bg-background"
                                  value={item.pedagio}
                                  onChange={(e) =>
                                    updateItemField(item.serviceId, "pedagio", e.target.value)
                                  }
                                />
                              </div>
                            </div>

                            {/* Campo de Visualização/Edição Completa do Bloco */}
                            <div className="space-y-1">
                              <Label className="text-xs font-semibold text-muted-foreground">
                                Texto Final Gerado (Editável diretamente abaixo)
                              </Label>
                              <Textarea
                                rows={9}
                                className="font-mono text-xs bg-muted/50 focus:bg-background transition-colors"
                                value={compiledText}
                                onChange={(e) =>
                                  updateItemField(item.serviceId, "customText", e.target.value)
                                }
                              />
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {!hasGenerated && plannerItems.length === 0 && (
            <div className="text-muted-foreground border-2 border-dashed rounded-lg p-12 text-center">
              Preencha os filtros e clique em "Criar Planner" para ver o resultado.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
