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
import { toast } from "sonner";
import { MessageCircle, AlertTriangle, Upload, Users } from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { ImportDialog } from "@/components/import-dialog";
import { MessageDialog } from "@/components/message-dialog";
import { buildInitialContacts } from "@/services/build-records";
import { detectInitialContactUpdates } from "@/services/initial-contact-updates";
import { formatPhoneForDisplay } from "@/utils/normalize-phone";
import { buildResponsibleMessage } from "@/services/messages";
import { buildWhatsAppUrl, copyToClipboard, openWhatsAppInReusableTab } from "@/utils/whatsapp-url";
import type { InitialContact } from "@/types";

const CONTATOS_DEBUG = true;

function debugContatos(label: string, data: unknown) {
  if (!CONTATOS_DEBUG) return;
  console.log(`[CONTATOS DEBUG] ${label}`, JSON.stringify(data, null, 2));
}

export const Route = createFileRoute("/contatos-iniciais")({
  component: InitialContactsPage,
});

type FilterKind = "all" | "valid" | "invalid" | "single" | "multi";
type MatrixFilter = "SGS ENGER" | "SGS DO BRASIL" | "SGS INDUSTRIAL";

const MATRIX_OPTIONS: MatrixFilter[] = ["SGS ENGER", "SGS DO BRASIL", "SGS INDUSTRIAL"];

function InitialContactsPage() {
  const store = useAppStore();
  const contacts = store.initialContacts;
  const [importOpen, setImportOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKind>("all");
  const [msgContact, setMsgContact] = useState<InitialContact | null>(null);
  const [chosenName, setChosenName] = useState<string>("");
  const [copiedNameId, setCopiedNameId] = useState<string | null>(null);
  const [selectedMatrices, setSelectedMatrices] = useState<MatrixFilter[]>([]);

  function matrixFilterValue(matrix: string | undefined): MatrixFilter | null {
    const normalized = (matrix ?? "").trim().toUpperCase();
    if (normalized === "SGS ENGER") return "SGS ENGER";
    if (normalized === "SGS DO BRASIL") return "SGS DO BRASIL";
    if (normalized === "SGS INDUSTRIAL") return "SGS INDUSTRIAL";
    return null;
  }

  const matrixOrder = useMemo(() => {
    const order: MatrixFilter[] = [];
    for (const contact of contacts) {
      const matrix = matrixFilterValue(contact.matrixOriginal);
      if (matrix && !order.includes(matrix)) order.push(matrix);
    }
    return order;
  }, [contacts]);
  const allAvailableMatricesSelected =
    matrixOrder.length > 0 && matrixOrder.every((matrix) => selectedMatrices.includes(matrix));

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("pt-BR");
    const originalOrder = new Map(contacts.map((contact, index) => [contact.id, index]));
    const selectedSet = new Set(selectedMatrices);
    const matrixGroupOrder = matrixOrder.filter((matrix) => selectedSet.has(matrix));
    return contacts
      .filter((c) => {
        if (q) {
          const hay = [
            c.responsibleOriginal,
            c.firstName,
            c.phoneOriginal,
            formatPhoneForDisplay(c.phoneNormalized),
            ...c.plates,
          ]
            .join(" ")
            .toLocaleLowerCase("pt-BR");
          if (!hay.includes(q)) return false;
        }
        const matrix = matrixFilterValue(c.matrixOriginal);
        if (selectedMatrices.length > 0 && (!matrix || !selectedSet.has(matrix))) return false;
        switch (filter) {
          case "valid":
            return c.phoneNormalized !== null;
          case "invalid":
            return c.phoneNormalized === null;
          case "single":
            return c.plates.length <= 1;
          case "multi":
            return c.plates.length > 1;
          default:
            return true;
        }
      })
      .sort((a, b) => {
        if (selectedMatrices.length === 0) {
          return (originalOrder.get(a.id) ?? 0) - (originalOrder.get(b.id) ?? 0);
        }
        const matrixA = matrixFilterValue(a.matrixOriginal);
        const matrixB = matrixFilterValue(b.matrixOriginal);
        const groupA = matrixA ? matrixGroupOrder.indexOf(matrixA) : Number.MAX_SAFE_INTEGER;
        const groupB = matrixB ? matrixGroupOrder.indexOf(matrixB) : Number.MAX_SAFE_INTEGER;
        if (groupA !== groupB) return groupA - groupB;
        return (originalOrder.get(a.id) ?? 0) - (originalOrder.get(b.id) ?? 0);
      });
  }, [contacts, search, filter, selectedMatrices, matrixOrder]);

  function toggleMatrix(matrix: MatrixFilter) {
    setSelectedMatrices((current) =>
      current.includes(matrix) ? current.filter((item) => item !== matrix) : [...current, matrix],
    );
  }

  function toggleAllMatrices() {
    setSelectedMatrices((current) =>
      matrixOrder.length > 0 && matrixOrder.every((matrix) => current.includes(matrix))
        ? []
        : MATRIX_OPTIONS.filter((matrix) => matrixOrder.includes(matrix)),
    );
  }

  debugContatos("page:render", {
    contactsCount: contacts.length,
    filteredCount: filtered.length,
    filter,
    search,
    invalidContacts: contacts
      .filter((c) => c.validationIssues.length > 0)
      .map((c) => ({
        id: c.id,
        responsible: c.responsibleOriginal,
        phoneOriginal: c.phoneOriginal,
        phoneNormalized: c.phoneNormalized,
        matrixOriginal: c.matrixOriginal,
        allPhones: c.allPhones,
        plates: c.plates,
        rowNumbers: c.rowNumbers,
        issues: c.validationIssues,
      })),
  });

  function openMessage(c: InitialContact) {
    debugContatos("button:visualizar-click", { contact: c });
    setMsgContact(c);
    setChosenName(c.firstName);
  }

  function normalizeMatrix(matrix: string | undefined): string {
    const normalized = (matrix ?? "").trim().toUpperCase();
    if (normalized === "SGS INDUSTRIAL") return "SGS DO BRASIL";
    if (normalized === "SGS ENGER") return "SGS ENGER";
    if (normalized === "SGS DO BRASIL") return "SGS DO BRASIL";
    return normalized;
  }

  function firstNameAndSurname(name: string): string {
    const cleaned = name
      .replace(/\(.*?\)/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const ignored = new Set(["de", "da", "do", "dos", "das"]);
    const parts = cleaned
      .split(" ")
      .filter((part) => part && !ignored.has(part.toLocaleLowerCase("pt-BR")))
      .slice(0, 2);
    return parts
      .map(
        (part) =>
          part.charAt(0).toLocaleUpperCase("pt-BR") + part.slice(1).toLocaleLowerCase("pt-BR"),
      )
      .join(" ");
  }

  async function copyContactName(c: InitialContact) {
    const name = firstNameAndSurname(c.responsibleOriginal);
    const matrix = normalizeMatrix(c.matrixOriginal);
    const text = [name, matrix].filter(Boolean).join(" - ");
    debugContatos("button:copy-name-click", { contact: c, copiedText: text });
    if (!text) {
      toast.error("Nome não encontrado para copiar.");
      return;
    }
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedNameId(c.id);
      toast.success("Nome copiado.");
    } else {
      toast.error("Não foi possível copiar o nome.");
    }
  }

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="w-6 h-6" /> Contato com cliente
          </h1>
          <p className="text-sm text-muted-foreground">
            {contacts.length} contatos agrupados por telefone.
          </p>
        </div>
        <Button
          onClick={() => {
            debugContatos("button:import-click", {
              contactsCount: contacts.length,
              invalidContacts: contacts.filter((c) => c.validationIssues.length > 0),
            });
            setImportOpen(true);
          }}
        >
          <Upload className="w-4 h-4 mr-2" /> Importar
        </Button>
      </div>

      {contacts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhum contato importado ainda. Clique em <b>Importar</b> para começar.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex-row items-center gap-2 flex-wrap space-y-0">
            <Input
              placeholder="Buscar por nome, telefone ou placa"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <Select value={filter} onValueChange={(v) => setFilter(v as FilterKind)}>
              <SelectTrigger className="max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="valid">Telefone válido</SelectItem>
                <SelectItem value="invalid">Telefone inválido</SelectItem>
                <SelectItem value="single">Uma placa</SelectItem>
                <SelectItem value="multi">Várias placas</SelectItem>
              </SelectContent>
            </Select>
            <Badge variant="secondary">{filtered.length} exibidos</Badge>
            <div className="flex gap-1 flex-wrap">
              <Button
                size="sm"
                variant={allAvailableMatricesSelected ? "default" : "outline"}
                onClick={toggleAllMatrices}
              >
                Todas
              </Button>
              {MATRIX_OPTIONS.map((matrix) => (
                <Button
                  key={matrix}
                  size="sm"
                  variant={selectedMatrices.includes(matrix) ? "default" : "outline"}
                  onClick={() => toggleMatrix(matrix)}
                  disabled={!matrixOrder.includes(matrix)}
                >
                  {matrix}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr className="text-left">
                    <th className="p-2">Responsável</th>
                    <th className="p-2">Telefone</th>
                    <th className="p-2">Matriz</th>
                    <th className="p-2">Placas</th>
                    <th className="p-2">Status</th>
                    <th className="p-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => {
                    const valid = c.phoneNormalized !== null;
                    return (
                      <tr key={c.id} className="border-t hover:bg-muted/30">
                        <td className="p-2">
                          <div className="font-medium">{c.responsibleOriginal || "—"}</div>
                          {(c.alternativeNames?.length ?? 0) > 0 && (
                            <div className="text-xs text-amber-600 flex items-center gap-1 mt-0.5">
                              <AlertTriangle className="w-3 h-3" />
                              Também associado a: {c.alternativeNames!.join(", ")}
                            </div>
                          )}
                        </td>
                        <td className="p-2">
                          {valid ? (
                            <span>{formatPhoneForDisplay(c.phoneNormalized)}</span>
                          ) : (
                            <span className="text-destructive text-xs">
                              {c.phoneOriginal || "Vazio"}
                            </span>
                          )}
                        </td>
                        <td className="p-2 text-xs">
                          <Badge variant="outline">
                            {matrixFilterValue(c.matrixOriginal) ?? "—"}
                          </Badge>
                        </td>
                        <td className="p-2">
                          <div className="flex gap-1 flex-wrap max-w-xs">
                            {c.plates.slice(0, 5).map((p) => (
                              <Badge key={p} variant="outline" className="font-mono text-[10px]">
                                {p}
                              </Badge>
                            ))}
                            {c.plates.length > 5 && (
                              <Badge variant="outline">+{c.plates.length - 5}</Badge>
                            )}
                          </div>
                        </td>
                        <td className="p-2">
                          <div className="flex flex-col gap-1">
                            {valid ? (
                              <Badge variant="default" className="w-fit">
                                Válido
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="w-fit">
                                Inválido
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="p-2">
                          <div className="flex gap-1 justify-end flex-wrap">
                            <Button size="sm" variant="outline" onClick={() => openMessage(c)}>
                              Visualizar
                            </Button>
                            {valid ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  const url = buildWhatsAppUrl(
                                    c.phoneNormalized!,
                                    buildResponsibleMessage(c),
                                  );
                                  if (!url) {
                                    toast.error(
                                      "Telefone inválido — não é possível abrir o WhatsApp.",
                                    );
                                    return;
                                  }
                                  const win = openWhatsAppInReusableTab(url);
                                  if (!win) {
                                    toast.error(
                                      "Não foi possível acionar o app do WhatsApp. Verifique se ele está instalado.",
                                    );
                                  }
                                }}
                              >
                                <MessageCircle className="w-4 h-4" />
                              </Button>
                            ) : (
                              <Button size="sm" variant="outline" disabled>
                                <MessageCircle className="w-4 h-4" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant={copiedNameId === c.id ? "default" : "outline"}
                              onClick={() => copyContactName(c)}
                            >
                              {copiedNameId === c.id ? "Copiado" : "Nome"}
                            </Button>
                          </div>
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

      {store.lastInitialContactUpdates.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              Últimos contatos atualizados
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {store.lastInitialContactUpdates.slice(0, 10).map((u) => (
              <div key={u.plate} className="rounded border bg-background p-2">
                <div className="font-mono text-xs font-semibold">{u.plate}</div>
                <div>
                  Responsável: {u.previousResponsible || "—"} → {u.nextResponsible || "—"}
                </div>
                <div>
                  Telefone: {u.previousPhone || "—"} → {u.nextPhone || "—"}
                </div>
              </div>
            ))}
            {store.lastInitialContactUpdates.length > 10 && (
              <div className="text-xs text-muted-foreground">
                +{store.lastInitialContactUpdates.length - 10} atualização(ões) não exibida(s).
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        kind="initial"
        title="Importar contato com cliente"
        onConfirm={(rows, mapping, fileName, headerRow, sheetName) => {
          debugContatos("confirm:start", {
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
          debugContatos("confirm:built", {
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
        }}
      />

      {msgContact && (
        <MessageDialog
          open={msgContact !== null}
          onOpenChange={(v) => !v && setMsgContact(null)}
          message={buildResponsibleMessage(msgContact, undefined, chosenName)}
          phone={msgContact.phoneNormalized ?? msgContact.allPhones?.[0] ?? msgContact.phoneOriginal ?? null}
          title={`Mensagem para ${msgContact.firstName || "responsável"}`}
          extraInfo={
            (msgContact.alternativeNames?.length ?? 0) > 0 ? (
              <div className="rounded border border-amber-500/50 bg-amber-500/10 p-2 text-xs">
                <div className="font-medium mb-1">
                  <AlertTriangle className="w-3 h-3 inline mr-1" />
                  Este telefone aparece associado a mais de um responsável.
                </div>
                <div className="flex gap-2 flex-wrap items-center">
                  <span>Usar nome:</span>
                  {[msgContact.firstName, ...(msgContact.alternativeNames ?? [])].map((n) => (
                    <Button
                      key={n}
                      variant={chosenName === n ? "default" : "outline"}
                      size="sm"
                      onClick={() => setChosenName(n)}
                    >
                      {n}
                    </Button>
                  ))}
                </div>
              </div>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
