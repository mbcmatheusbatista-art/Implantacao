import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ClipboardList, MessageCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { useAppStore } from "@/stores/app-store";
import { buildWhatsAppUrl, openWhatsAppInReusableTab } from "@/utils/whatsapp-url";

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

  function buildTableMessage(services: typeof filtered): string {
    const header = `*Placa*    *Nome do Responsável*    *Telefone*    *Observações / Particularidades*`;
    const lines = services.map((svc) => {
      const placa = svc.plateOriginal || "-";
      const nome = svc.responsibleOriginal || "-";
      const fone = svc.phoneOriginal || "-";
      const obs = svc.observationsOriginal || "-";
      return `${placa.padEnd(12)}     ${nome.padEnd(30)}     ${fone.padEnd(18)}     ${obs}`;
    });
    return `${header}\n${lines.join("\n")}`;
  }

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
          <div className="flex items-center gap-3">
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
            {selected && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const phone = selected === "Rogério" ? "11 9 4175-4926" : "";
                  if (!phone) return;
                  const url = buildWhatsAppUrl(phone, buildTableMessage(filtered));
                  if (!url) {
                    toast.error("Telefone inválido — não é possível abrir o WhatsApp.");
                    return;
                  }
                  const win = openWhatsAppInReusableTab(url);
                  if (!win) {
                    toast.error("Não foi possível acionar o app do WhatsApp. Verifique se ele está instalado.");
                  }
                }}
              >
                <MessageCircle className="w-4 h-4 mr-2" />
                WhatsApp
              </Button>
            )}
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
