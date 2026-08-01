import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Upload, Headphones, AlertTriangle } from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { ImportDialog } from "@/components/import-dialog";
import { ImportProblemsDialog } from "@/components/import-problems-dialog";
import { buildServiceCalls } from "@/services/build-records";
import { equipmentLabel } from "@/utils/normalize-equipment";
import { stripFormatMarkers } from "@/utils/normalize-text";
import type { ServiceCall } from "@/types";

export const Route = createFileRoute("/chamados")({
  component: ChamadosPage,
});

function fatDisplay(value: string | undefined): { text: string; tone: "sim" | "nao" | "neutral" } {
  const cleaned = stripFormatMarkers(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
  if (!cleaned) return { text: "—", tone: "neutral" };
  const simWords = new Set(["SIM", "S", "YES", "FATURADO", "OK", "1"]);
  const naoWords = new Set(["NAO", "N", "NO", "NAO FATURADO", "0"]);
  if (simWords.has(cleaned)) return { text: "SIM", tone: "sim" };
  if (naoWords.has(cleaned)) return { text: "NÃO", tone: "nao" };
  return { text: cleaned, tone: "neutral" };
}

function ChamadosPage() {
  const store = useAppStore();
  const calls = store.calls;
  const [importOpen, setImportOpen] = useState(false);
  const [problemsOpen, setProblemsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "valid" | "invalid">("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("pt-BR");
    return calls.filter((c) => {
      if (q) {
        const hay = [
          c.chamadoOriginal,
          c.plateOriginal,
          c.equipmentOriginal,
          c.atendenteOriginal,
          c.fatOriginal,
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("pt-BR");
        if (!hay.includes(q)) return false;
      }
      switch (filter) {
        case "valid":
          return c.validationIssues.length === 0;
        case "invalid":
          return c.validationIssues.length > 0;
        default:
          return true;
      }
    });
  }, [calls, search, filter]);

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Headphones className="w-6 h-6" /> Chamados e atendimentos
          </h1>
          <p className="text-sm text-muted-foreground">{calls.length} chamados importados.</p>
        </div>
        <div className="flex gap-2">
          {calls.filter((c) => c.validationIssues.length > 0).length > 0 && (
            <Button variant="destructive" onClick={() => setProblemsOpen(true)}>
              <AlertTriangle className="w-4 h-4 mr-2" />
              {calls.filter((c) => c.validationIssues.length > 0).length} com problemas
            </Button>
          )}
          <Button onClick={() => setImportOpen(true)}>
            <Upload className="w-4 h-4 mr-2" /> Importar
          </Button>
        </div>
      </div>

      {calls.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhum chamado importado ainda. Clique em <b>Importar</b> para começar.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex-row items-center gap-2 flex-wrap space-y-0">
            <Input
              placeholder="Buscar por chamado, placa, equipamento, atendente ou FAT"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <Select
              value={filter}
              onValueChange={(v) => setFilter(v as "all" | "valid" | "invalid")}
            >
              <SelectTrigger className="max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="valid">Sem problemas</SelectItem>
                <SelectItem value="invalid">Com problemas</SelectItem>
              </SelectContent>
            </Select>
            <Badge variant="secondary">{filtered.length} exibidos</Badge>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr className="text-left">
                    <th className="p-2">CHAMADO</th>
                    <th className="p-2">PLACA</th>
                    <th className="p-2">EQUIP.</th>
                    <th className="p-2">ATEND.</th>
                    <th className="p-2">FAT</th>
                    <th className="p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c: ServiceCall) => {
                    const issues = c.validationIssues ?? [];
                    return (
                      <tr key={c.id} className="border-t hover:bg-muted/30">
                        <td className="p-2 font-medium">
                          {stripFormatMarkers(c.chamadoOriginal) || "—"}
                        </td>
                        <td className="p-2 font-mono text-xs whitespace-nowrap">
                          {stripFormatMarkers(c.plateOriginal) || "—"}
                        </td>
                        <td className="p-2 whitespace-nowrap">
                          {equipmentLabel(c.equipmentNormalized)}
                        </td>
                        <td className="p-2">{stripFormatMarkers(c.atendenteOriginal) || "—"}</td>
                        <td className="p-2 font-mono text-xs whitespace-nowrap">
                          {(() => {
                            const fat = fatDisplay(c.fatOriginal);
                            if (fat.tone === "sim")
                              return (
                                <span className="text-green-600 font-semibold">{fat.text}</span>
                              );
                            if (fat.tone === "nao")
                              return <span className="text-red-600 font-semibold">{fat.text}</span>;
                            return <span>{fat.text}</span>;
                          })()}
                        </td>
                        <td className="p-2">
                          {issues.length === 0 ? (
                            <Badge variant="default" className="w-fit">
                              Válido
                            </Badge>
                          ) : (
                            <Badge
                              variant="destructive"
                              className="w-fit"
                              title={issues.join(" • ")}
                            >
                              {issues.length} problema(s)
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Nenhum chamado encontrado com os filtros atuais.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        kind="calls"
        title="Importar chamados e atendimentos"
        onConfirm={(rows, mapping, fileName, headerRow, sheetName) => {
          const { records, diagnostic } = buildServiceCalls(rows, mapping, headerRow);
          store.setCalls(
            records,
            { fileName, count: records.length },
            { ...diagnostic, fileName, sheetName, timestamp: Date.now() },
          );
        }}
      />

      <ImportProblemsDialog
        open={problemsOpen}
        onOpenChange={setProblemsOpen}
        kind="calls"
        records={calls}
        onChange={(records) => store.replaceImportRecords("calls", records)}
      />
    </div>
  );
}
