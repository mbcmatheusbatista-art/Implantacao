import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MessageCircle, Upload, Wrench } from "lucide-react";
import { useAppStore, getSessionLoads } from "@/stores/app-store";
import { ImportDialog } from "@/components/import-dialog";
import { buildTechnicians } from "@/services/build-records";
import { formatPhoneForDisplay } from "@/utils/normalize-phone";
import { stockStatusLabel, stripQuantityFormat } from "@/utils/parse-quantity";
import { buildWhatsAppUrl } from "@/utils/whatsapp-url";
import type { TechnicianStockStatus } from "@/types";

export const Route = createFileRoute("/tecnicos")({
  component: TechniciansPage,
});

type Filter = "all" | "available" | "no_stock" | "confirm" | "unknown";

function statusVariant(
  s: TechnicianStockStatus,
): "default" | "destructive" | "secondary" | "outline" {
  switch (s) {
    case "DISPONIVEL":
      return "default";
    case "SEM_MATERIAL":
      return "destructive";
    case "CONFIRMAR":
      return "secondary";
    default:
      return "outline";
  }
}

const FORMAT_MARKER_RE = /\u200BFORMAT:(green|red|orange|REDD)\u200B|FORMAT:REDD/g;

function formatAddressField(raw: string): string {
  const cleaned = raw.replace(FORMAT_MARKER_RE, "").trim();
  return cleaned || "sem endereço";
}

function TechniciansPage() {
  const store = useAppStore();
  const techs = store.technicians;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const loads = useMemo(() => getSessionLoads(store.assignments), [store.assignments]);

  const doneCounts = useMemo(() => {
    const m = new Map<string, { s8: number; g5: number }>();
    const fmtRe = /\u200BFORMAT:(green|red|orange|REDD)\u200B|FORMAT:REDD/g;
    for (const svc of store.confirmedServices) {
      const status = (svc.serviceStatus || svc.serviceStatusOriginal || "").toUpperCase();
      if (status === "AGENDADO" || status === "FINALIZADO") {
        let techName: string | null = null;
        const a = store.assignments.find((x) => x.serviceId === svc.id);
        if (a) {
          const tech = store.technicians.find((x) => x.id === a.technicianId);
          if (tech) techName = tech.nameOriginal.toLowerCase().trim();
        } else if (svc.technicianOriginal) {
          const raw = svc.technicianOriginal.replace(/\u200BFORMAT:(green|red|orange|REDD)\u200B|FORMAT:REDD/g, "").trim().toLowerCase();
          const tech = store.technicians.find((x) => raw.includes(x.nameOriginal.toLowerCase().trim()) || x.nameOriginal.toLowerCase().trim().includes(raw));
          if (tech) techName = tech.nameOriginal.toLowerCase().trim();
        }
        if (techName) {
          const current = m.get(techName) ?? { s8: 0, g5: 0 };
          if (svc.equipmentNormalized === "S8_ECO") {
            m.set(techName, { s8: current.s8 + 1, g5: current.g5 });
          } else if (svc.equipmentNormalized === "S8_ECO_G5_PLUS") {
            m.set(techName, { s8: current.s8 + 1, g5: current.g5 + 1 });
          } else {
            m.set(techName, { s8: current.s8 + 1, g5: current.g5 });
          }
        }
      }
    }
    return m;
  }, [store.confirmedServices, store.assignments, store.technicians]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("pt-BR");
    return techs.filter((t) => {
      if (q) {
        const hay = [t.nameOriginal, t.cityOriginal, t.state, t.phoneOriginal]
          .join(" ")
          .toLocaleLowerCase("pt-BR");
        if (!hay.includes(q)) return false;
      }
      switch (filter) {
        case "available":
          return t.stockStatus === "DISPONIVEL";
        case "no_stock":
          return t.stockStatus === "SEM_MATERIAL";
        case "confirm":
          return t.stockStatus === "CONFIRMAR";
        case "unknown":
          return t.stockStatus === "NAO_INFORMADO" || t.stockStatus === "TEXTO_NAO_INTERPRETADO";
        default:
          return true;
      }
    });
  }, [techs, search, filter]);

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wrench className="w-6 h-6" /> Contatar aos técnicos
          </h1>
          <p className="text-sm text-muted-foreground">
            {techs.length} contatos aos técnicos importados.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Upload className="w-4 h-4 mr-2" /> Importar
        </Button>
      </div>

      {techs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhum contato aos técnicos importado ainda.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex-row gap-2 flex-wrap space-y-0 items-center">
            <Input
              placeholder="Buscar por nome, cidade, UF, telefone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
              <SelectTrigger className="max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="available">Disponível</SelectItem>
                <SelectItem value="no_stock">Sem material</SelectItem>
                <SelectItem value="confirm">Confirmar</SelectItem>
                <SelectItem value="unknown">Não informado</SelectItem>
              </SelectContent>
            </Select>
            <Badge variant="secondary">{filtered.length} exibidos</Badge>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr className="text-left">
                    <th className="p-2">Nome</th>
                    <th className="p-2">Celular</th>
                    <th className="p-2">Cidade</th>
                    <th className="p-2">UF</th>
                    <th className="p-2">Quantidade</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Sessão</th>
                    <th className="p-2">Saldo estimado</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => {
                    const load = loads.get(t.id) ?? 0;
                    const key = t.nameOriginal.replace(/\u200BFORMAT:(green|red|orange|REDD)\u200B|FORMAT:REDD/g, "").trim().toLowerCase();
                    const done = doneCounts.get(key) ?? { s8: 0, g5: 0 };
                    const eq = t.equipmentBreakdown;
                    const isG5 = eq && eq.g5PlusSets > 0;
                    const used = isG5 ? done.g5 : done.s8;
                    const balance =
                      t.availableQuantity !== null ? Math.max(0, t.availableQuantity - used) : null;
                    return(
                      <tr key={t.id} className="border-t hover:bg-muted/30">
                        <td className="p-2">{t.nameOriginal || "—"}</td>
                        <td className="p-2">
                          {(() => {
                            const phone = t.phoneNormalized || t.phoneOriginal;
                            const url = phone ? buildWhatsAppUrl(phone, "") : null;
                            return url ? (
                              <a href={url} target="_blank" rel="noopener noreferrer">
                                <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white">
                                  <MessageCircle className="w-4 h-4" />
                                </Button>
                              </a>
                            ) : (
                              <span className="text-destructive text-xs">—</span>
                            );
                          })()}
                        </td>
                        <td className="p-2">{t.cityOriginal ? formatAddressField(t.cityOriginal) : "—"}</td>
                        <td className="p-2">{t.state ? formatAddressField(t.state) : "—"}</td>
                        <td className="p-2 text-xs" title={t.quantityOriginal}>
                          {t.quantityOriginal ? stripQuantityFormat(t.quantityOriginal) : "—"}
                        </td>
                        <td className="p-2">
                          <Badge variant={statusVariant(t.stockStatus)}>
                            {stockStatusLabel(t.stockStatus)}
                          </Badge>
                        </td>
                        <td className="p-2 text-center">{load}</td>
                        <td className="p-2">
                          {balance !== null ? (
                            <Badge variant={balance < 0 ? "destructive" : "outline"}>
                              {balance}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <ImportDialog
        open={open}
        onOpenChange={setOpen}
        kind="technicians"
        title="Importar contatos aos técnicos"
        onConfirm={(rows, mapping, fileName, headerRow, sheetName) => {
          const { records, diagnostic } = buildTechnicians(rows, mapping, headerRow);
          store.setTechnicians(
            records,
            { fileName, count: records.length },
            { ...diagnostic, fileName, sheetName, timestamp: Date.now() },
          );
        }}
      />
    </div>
  );
}
