import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ClipboardList } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAppStore } from "@/stores/app-store";

export const Route = createFileRoute("/solicitacoes")({
  component: SolicitacoesPage,
});

const ADMIN_NAMES = ["Rogério", "Fernando"] as const;
type AdminName = (typeof ADMIN_NAMES)[number];

function containsAdminName(text: string, name: AdminName): boolean {
  const regexMap: Record<AdminName, RegExp> = {
    Rogério: /\b[Rr][Oo][Gg][Eeèéêë][Rr][Iiíì][Ooóòôõ]\b/,
    Fernando: /\b[Ff][Ee][Rr][Nn][Aaãâàá][Nn][Dd][Ooóòôõ]\b/,
  };
  return regexMap[name].test(text);
}

function SolicitacoesPage() {
  const confirmedServices = useAppStore((s) => s.confirmedServices);
  const [selected, setSelected] = useState<AdminName | "">("");

  const filtered = useMemo(() => {
    if (!selected) return [];
    return confirmedServices.filter((svc) => {
      const obs = svc.observationsOriginal ?? "";
      return containsAdminName(obs, selected);
    });
  }, [confirmedServices, selected]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardList className="w-6 h-6" />
          Solicitações Adm Rogério / Fernando
        </h1>
        <p className="text-muted-foreground mt-1">
          Filtre as solicitações pelo administrador responsável.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Selecionar administrador</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-w-xs">
            <Select value={selected} onValueChange={(v) => setSelected(v as AdminName | "")}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                {ADMIN_NAMES.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {selected && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {filtered.length} solicitações para {selected}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <div className="text-sm text-muted-foreground px-6 pb-6">
                Nenhuma solicitação encontrada.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Placa</TableHead>
                    <TableHead>Nome do Responsável</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead className="max-w-md">Observações / Particularidades</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((svc) => (
                    <TableRow key={svc.id}>
                      <TableCell className="font-mono text-sm">{svc.plateOriginal}</TableCell>
                      <TableCell>{svc.responsibleOriginal}</TableCell>
                      <TableCell className="whitespace-nowrap">{svc.phoneOriginal}</TableCell>
                      <TableCell className="max-w-md whitespace-pre-wrap text-sm text-muted-foreground">
                        {svc.observationsOriginal}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
