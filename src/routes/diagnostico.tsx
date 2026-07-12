import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity } from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import type { ImportDiagnostic, ImportKind } from "@/types";

export const Route = createFileRoute("/diagnostico")({
  component: DiagnosticsPage,
});

const TITLES: Record<ImportKind, string> = {
  initial: "Contato com cliente",
  confirmed: "Cliente com endereço",
  technicians: "Contatar aos técnicos",
};

function DiagnosticsPage() {
  const diags = useAppStore((s) => s.diagnostics);

  const items: [ImportKind, ImportDiagnostic | undefined][] = [
    ["initial", diags.initial],
    ["confirmed", diags.confirmed],
    ["technicians", diags.technicians],
  ];

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Activity className="w-6 h-6" /> Diagnóstico das importações
        </h1>
        <p className="text-sm text-muted-foreground">Resumo das últimas importações realizadas.</p>
      </div>
      {items.every(([, d]) => !d) ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhuma importação realizada ainda.
          </CardContent>
        </Card>
      ) : (
        items.map(([kind, d]) =>
          d ? (
            <Card key={kind}>
              <CardHeader>
                <CardTitle className="text-base">{TITLES[kind]}</CardTitle>
                <div className="text-xs text-muted-foreground">
                  {d.fileName} {d.sheetName ? `· aba: ${d.sheetName}` : ""} · linha do cabeçalho:{" "}
                  {d.headerRow + 1}
                </div>
              </CardHeader>
              <CardContent className="text-sm space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  <Stat label="Importadas" value={d.rowsImported} />
                  <Stat label="Ignoradas" value={d.rowsSkipped} />
                  <Stat label="Telefones inválidos" value={d.invalidPhones} tone="warn" />
                  <Stat label="Placas vazias" value={d.emptyPlates} tone="warn" />
                  <Stat label="Nomes vazios" value={d.emptyNames} tone="warn" />
                  {kind === "confirmed" && (
                    <>
                      <Stat label="Endereços vazios" value={d.emptyAddresses} tone="warn" />
                      <Stat label="Equipamentos não id." value={d.equipmentUnknown} tone="warn" />
                    </>
                  )}
                  {kind === "technicians" && (
                    <Stat
                      label="Quantidades não interpretadas"
                      value={d.quantityUnparsed}
                      tone="warn"
                    />
                  )}
                  {kind === "initial" && (
                    <>
                      <Stat label="Contatos agrupados" value={d.groupedContacts} />
                      <Stat label="Conflitos de nome" value={d.nameConflicts} tone="warn" />
                    </>
                  )}
                </div>
                <div>
                  <div className="text-xs font-medium mb-1">Colunas encontradas</div>
                  <div className="flex flex-wrap gap-1">
                    {d.columnsFound.map((c) => (
                      <Badge key={c} variant="outline" className="text-[10px]">
                        {c}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium mb-1">Colunas mapeadas</div>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(d.columnsMapped).map(([k, v]) => (
                      <Badge key={k} variant="secondary" className="text-[10px]">
                        {k} → {v}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null,
        )
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "warn" }) {
  return (
    <div className="border rounded p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`text-lg font-semibold ${tone === "warn" && value > 0 ? "text-amber-600" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}
