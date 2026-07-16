import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Users, ClipboardCheck, Wrench, Upload, ClipboardPaste, Shield, ArrowLeftRight } from "lucide-react";
import { ImportDialog } from "@/components/import-dialog";
import { useAppStore } from "@/stores/app-store";
import {
  buildInitialContacts,
  buildConfirmedServices,
  buildTechnicians,
} from "@/services/build-records";
import type { ImportKind } from "@/types";
import { detectInitialContactUpdates } from "@/services/initial-contact-updates";

const IMPORT_DEBUG = true;

function debugImport(label: string, data: unknown) {
  if (!IMPORT_DEBUG) return;
  console.log(`[IMPORT DEBUG][HOME] ${label}`, data);
}

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const [openImport, setOpenImport] = useState<{
    kind: ImportKind;
    tab: "upload" | "paste";
  } | null>(null);
  const store = useAppStore();

  const cards: {
    kind: ImportKind;
    icon: React.ElementType;
    title: string;
    desc: string;
    count: number;
    issues: number;
  }[] = [
    {
      kind: "initial",
      icon: Users,
      title: "Contato com cliente",
      desc: "Placa, responsável e telefone.",
      count: store.initialContacts.length,
      issues: store.initialContacts.filter((c) => c.validationIssues.length > 0).length,
    },
    {
      kind: "confirmed",
      icon: ClipboardCheck,
      title: "Cliente com endereço",
      desc: "Placa, responsável, telefone, endereço e equipamento.",
      count: store.confirmedServices.length,
      issues: store.confirmedServices.filter((c) => c.validationIssues.length > 0).length,
    },
    {
      kind: "technicians",
      icon: Wrench,
      title: "Contatar aos técnicos",
      desc: "Técnico, celular, cidade, UF e quantidade disponível.",
      count: store.technicians.length,
      issues: store.technicians.filter((c) => c.validationIssues.length > 0).length,
    },
  ];

  debugImport("cards:render", {
    cards: cards.map((card) => ({
      kind: card.kind,
      title: card.title,
      count: card.count,
      issues: card.issues,
    })),
    initialInvalidContacts: store.initialContacts
      .filter((c) => c.validationIssues.length > 0)
      .map((c) => ({
        id: c.id,
        responsible: c.responsibleOriginal,
        phoneOriginal: c.phoneOriginal,
        phoneNormalized: c.phoneNormalized,
        plates: c.plates,
        issues: c.validationIssues,
      })),
  });

  function handleConfirm(kind: ImportKind) {
    return (
      rows: Record<string, string>[],
      mapping: Parameters<typeof buildInitialContacts>[1],
      fileName: string,
      headerRow: number,
      sheetName?: string,
    ) => {
      if (kind === "initial") {
        debugImport("confirm:initial:start", {
          fileName,
          sheetName,
          headerRow,
          mapping,
          rowsCount: rows.length,
          rowsPreview: rows.slice(0, 20),
          previousContactsCount: store.initialContacts.length,
        });
        const { records, diagnostic } = buildInitialContacts(rows, mapping, headerRow);
        const updates = detectInitialContactUpdates(store.initialContacts, records);
        debugImport("confirm:initial:built", {
          recordsCount: records.length,
          diagnostic,
          updates,
          invalidRecords: records.filter((record) => record.validationIssues.length > 0),
        });
        store.setInitialContacts(
          records,
          { fileName, count: records.length },
          { ...diagnostic, fileName, sheetName, timestamp: Date.now() },
        );
        if (updates.length > 0) {
          toast.success(`${updates.length} contato(s) atualizado(s).`, {
            description: updates
              .slice(0, 5)
              .map((u) => u.plate)
              .join(", "),
          });
        }
      } else if (kind === "confirmed") {
        debugImport("confirm:confirmed:start", {
          fileName,
          sheetName,
          headerRow,
          mapping,
          rowsCount: rows.length,
          rowsPreview: rows.slice(0, 20),
        });
        const { records, diagnostic } = buildConfirmedServices(rows, mapping, headerRow);
        store.setConfirmedServices(
          records,
          { fileName, count: records.length },
          { ...diagnostic, fileName, sheetName, timestamp: Date.now() },
        );
      } else {
        debugImport("confirm:technicians:start", {
          fileName,
          sheetName,
          headerRow,
          mapping,
          rowsCount: rows.length,
          rowsPreview: rows.slice(0, 20),
        });
        const { records, diagnostic } = buildTechnicians(rows, mapping, headerRow);
        store.setTechnicians(
          records,
          { fileName, count: records.length },
          { ...diagnostic, fileName, sheetName, timestamp: Date.now() },
        );
      }
    };
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Assistente de Contatos e Agendamentos</h1>
        <p className="text-muted-foreground mt-1">
          Importe as planilhas para organizar contatos, agrupar placas e gerar mensagens de
          WhatsApp.
        </p>
      </div>

      <Alert>
        <Shield className="w-4 h-4" />
        <AlertDescription>
          Os dados são processados somente neste navegador e não são enviados para servidores. A
          planilha original nunca é alterada.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {cards.map((c) => (
          <Card
            key={c.kind}
            className="flex flex-col"
            onMouseEnter={() =>
              debugImport("card:hover", {
                kind: c.kind,
                title: c.title,
                count: c.count,
                issues: c.issues,
              })
            }
          >
            <CardHeader>
              <div className="flex items-center gap-2">
                <c.icon className="w-5 h-5 text-primary" />
                <CardTitle className="text-base">{c.title}</CardTitle>
              </div>
              <CardDescription>{c.desc}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col gap-3">
              <div className="flex gap-2 flex-wrap">
                <Badge variant={c.count > 0 ? "default" : "secondary"}>{c.count} registros</Badge>
                {c.issues > 0 && <Badge variant="destructive">{c.issues} com problemas</Badge>}
              </div>
              <div className="flex gap-2 mt-auto">
                <Button
                  size="sm"
                  onClick={() => {
                    debugImport("button:upload-click", {
                      kind: c.kind,
                      title: c.title,
                      count: c.count,
                      issues: c.issues,
                    });
                    setOpenImport({ kind: c.kind, tab: "upload" });
                  }}
                >
                  <Upload className="w-4 h-4 mr-2" /> Fazer upload
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    debugImport("button:paste-click", {
                      kind: c.kind,
                      title: c.title,
                      count: c.count,
                      issues: c.issues,
                    });
                    setOpenImport({ kind: c.kind, tab: "paste" });
                  }}
                >
                  <ClipboardPaste className="w-4 h-4 mr-2" /> Colar dados
                </Button>
              </div>
              {c.count > 0 && (
                <Link
                  to={
                    c.kind === "initial"
                      ? "/contatos-iniciais"
                      : c.kind === "confirmed"
                        ? "/atendimentos"
                        : "/tecnicos"
                  }
                  className="text-xs text-primary hover:underline"
                >
                  Ver dados →
                </Link>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Distribuição / Atribuição */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5 text-primary" />
            <CardTitle className="text-base">Distribuir atendimentos</CardTitle>
          </div>
          <CardDescription>
            Atribua técnicos aos clientes, ajuste cronograma e visualize a distribuição por
            técnico.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button size="sm" asChild>
              <Link to="/distribuicao">
                <ArrowLeftRight className="w-4 h-4 mr-2" /> Atribuir
              </Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link to="/roteirizacao">Roteirização</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {openImport && (
        <ImportDialog
          open={openImport !== null}
          onOpenChange={(v) => !v && setOpenImport(null)}
          kind={openImport.kind}
          initialTab={openImport.tab}
          title={
            openImport.kind === "initial"
              ? "Importar contato com cliente"
              : openImport.kind === "confirmed"
                ? "Importar cliente com endereço"
                : "Importar contatos aos técnicos"
          }
          onConfirm={handleConfirm(openImport.kind)}
        />
      )}
    </div>
  );
}
