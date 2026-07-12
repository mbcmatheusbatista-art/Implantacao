import { createFileRoute, Link } from "@tanstack/react-router";
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
import { Upload, ClipboardCheck, Share2 } from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { ImportDialog } from "@/components/import-dialog";
import { buildConfirmedServices } from "@/services/build-records";
import { formatPhoneForDisplay } from "@/utils/normalize-phone";
import { equipmentLabel } from "@/utils/normalize-equipment";

export const Route = createFileRoute("/atendimentos")({
  component: ConfirmedServicesPage,
});

type Filter = "all" | "with_address" | "no_address" | "s8_eco" | "s8_eco_g5" | "unassigned";

function ConfirmedServicesPage() {
  const store = useAppStore();
  const services = store.confirmedServices;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const assignedIds = useMemo(
    () => new Set(store.assignments.map((a) => a.serviceId)),
    [store.assignments],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("pt-BR");
    return services.filter((s) => {
      if (q) {
        const hay = [
          s.plateOriginal,
          s.responsibleOriginal,
          s.cityDetected,
          s.stateDetected,
          s.equipmentOriginal,
          s.fullAddress,
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("pt-BR");
        if (!hay.includes(q)) return false;
      }
      switch (filter) {
        case "with_address":
          return !!s.fullAddress;
        case "no_address":
          return !s.fullAddress;
        case "s8_eco":
          return s.equipmentNormalized === "S8_ECO";
        case "s8_eco_g5":
          return s.equipmentNormalized === "S8_ECO_G5_PLUS";
        case "unassigned":
          return !assignedIds.has(s.id);
        default:
          return true;
      }
    });
  }, [services, search, filter, assignedIds]);

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6" /> Cliente com endereço
          </h1>
          <p className="text-sm text-muted-foreground">
            {services.length} clientes com endereço importados.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/distribuicao">
            <Button variant="outline">
              <Share2 className="w-4 h-4 mr-2" /> Distribuir
            </Button>
          </Link>
          <Button onClick={() => setOpen(true)}>
            <Upload className="w-4 h-4 mr-2" /> Importar
          </Button>
        </div>
      </div>

      {services.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhum cliente com endereço importado ainda.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex-row gap-2 flex-wrap space-y-0 items-center">
            <Input
              placeholder="Buscar placa, responsável, cidade, UF, equipamento"
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
                <SelectItem value="with_address">Endereço preenchido</SelectItem>
                <SelectItem value="no_address">Endereço vazio</SelectItem>
                <SelectItem value="s8_eco">S8 ECO</SelectItem>
                <SelectItem value="s8_eco_g5">S8 ECO + G5 Plus</SelectItem>
                <SelectItem value="unassigned">Sem técnico</SelectItem>
              </SelectContent>
            </Select>
            <Badge variant="secondary">{filtered.length} exibidos</Badge>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr className="text-left">
                    <th className="p-2">Placa</th>
                    <th className="p-2">Responsável</th>
                    <th className="p-2">Telefone</th>
                    <th className="p-2">Endereço</th>
                    <th className="p-2">Cidade/UF</th>
                    <th className="p-2">Equipamento</th>
                    <th className="p-2">Técnico</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => {
                    const a = store.assignments.find((x) => x.serviceId === s.id);
                    const t = a ? store.technicians.find((x) => x.id === a.technicianId) : null;
                    return (
                      <tr key={s.id} className="border-t hover:bg-muted/30">
                        <td className="p-2 font-mono text-xs">{s.plateOriginal || "—"}</td>
                        <td className="p-2">{s.responsibleOriginal || "—"}</td>
                        <td className="p-2 text-xs">
                          {s.phoneNormalized ? (
                            formatPhoneForDisplay(s.phoneNormalized)
                          ) : (
                            <span className="text-destructive">{s.phoneOriginal || "—"}</span>
                          )}
                        </td>
                        <td className="p-2 max-w-xs truncate" title={s.fullAddress}>
                          {s.fullAddress || <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="p-2 text-xs">
                          {s.cityDetected || "—"}/{s.stateDetected || "—"}
                        </td>
                        <td className="p-2">
                          <Badge
                            variant={
                              s.equipmentNormalized === "NAO_IDENTIFICADO"
                                ? "destructive"
                                : "outline"
                            }
                          >
                            {equipmentLabel(s.equipmentNormalized)}
                          </Badge>
                        </td>
                        <td className="p-2">
                          {t ? (
                            <Badge variant="default">{t.firstName || t.nameOriginal}</Badge>
                          ) : (
                            <Link
                              to="/distribuicao"
                              search={{ serviceId: s.id }}
                              className="text-xs text-primary hover:underline"
                            >
                              Atribuir
                            </Link>
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
        kind="confirmed"
        title="Importar cliente com endereço"
        onConfirm={(rows, mapping, fileName, headerRow, sheetName) => {
          const { records, diagnostic } = buildConfirmedServices(rows, mapping, headerRow);
          store.setConfirmedServices(
            records,
            { fileName, count: records.length },
            { ...diagnostic, fileName, sheetName, timestamp: Date.now() },
          );
        }}
      />
    </div>
  );
}
