import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowRight, Upload, ClipboardPaste } from "lucide-react";
import type { FieldKey, ImportKind } from "@/types";
import { parseExcelFile, rowsToObjects } from "@/services/excel-parser";
import { parsePastedData, parsePastedHtmlData } from "@/services/pasted-data-parser";
import { autoMapColumns, detectHeaderRow, fieldsForKind } from "@/services/column-detection";

const FIELD_LABELS: Record<FieldKey, string> = {
  plate: "Placa",
  responsible: "Responsável",
  phone: "Telefone",
  matrix: "Matriz",
  address: "Endereço",
  equipment: "Equipamento",
  technician: "Técnico",
  city: "Cidade",
  state: "UF",
  quantity: "Quantidade",
  status: "Status",
  dataHora: "Data e hora",
  observations: "Observações / Particularidades",
};

const CORE_FIELDS: Record<ImportKind, FieldKey[]> = {
  initial: ["plate", "responsible", "phone", "matrix"],
  confirmed: ["plate", "responsible", "phone", "address", "equipment", "status"],
  technicians: ["technician", "phone", "city", "state"],
};

function captureFieldLabel(kind: ImportKind, field: FieldKey) {
  if (kind === "initial" && field === "responsible") return "Responsável (condutor)";
  if (kind === "initial" && field === "phone") return "Telefone (contato)";
  return FIELD_LABELS[field];
}

const DIALOG_DEBUG = true;

function debugDialog(label: string, data: unknown) {
  if (!DIALOG_DEBUG) return;
  console.log(`[DIALOG DEBUG] ${label}`, JSON.stringify(data, null, 2));
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: ImportKind;
  title: string;
  initialTab?: "upload" | "paste";
  onConfirm: (
    rows: Record<string, string>[],
    mapping: Partial<Record<FieldKey, string>>,
    fileName: string,
    headerRow: number,
    sheetName?: string,
    fullRows?: Record<string, string>[],
  ) => void;
}

export function ImportDialog({
  open,
  onOpenChange,
  kind,
  title,
  initialTab = "paste",
  onConfirm,
}: Props) {
  const [tab, setTab] = useState<"upload" | "paste">(initialTab);
  const [fileName, setFileName] = useState("");
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const [sheets, setSheets] = useState<Record<string, unknown[][]>>({});
  const [pastedText, setPastedText] = useState("");
  const [pastedRowsWithFormatting, setPastedRowsWithFormatting] = useState<string[][] | null>(null);
  const [rawRows, setRawRows] = useState<unknown[][]>([]);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<Partial<Record<FieldKey, string>>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const allFields = useMemo(() => fieldsForKind(kind), [kind]);
  const requiredFields = useMemo(() => CORE_FIELDS[kind], [kind]);
  const optionalFields = useMemo(
    () => allFields.filter((field) => !requiredFields.includes(field)),
    [allFields, kind, requiredFields],
  );

  function resetState() {
    setTab(initialTab);
    setFileName("");
    setSheetNames([]);
    setSelectedSheet("");
    setSheets({});
    setPastedText("");
    setPastedRowsWithFormatting(null);
    setRawRows([]);
    setHeaderRow(0);
    setMapping({});
  }

  const { headers, dataObjects } = useMemo(() => {
    if (rawRows.length === 0) return { headers: [], dataObjects: [] };
    const { headers, data } = rowsToObjects(rawRows, headerRow);
    return { headers, dataObjects: data };
  }, [rawRows, headerRow]);

  const pastedCapturePreview = useMemo(() => {
    if (!pastedText.trim() || rawRows.length > 0) return {} as Partial<Record<FieldKey, string>>;
    const rows = pastedRowsWithFormatting ?? parsePastedData(pastedText);
    if (rows.length === 0) return {} as Partial<Record<FieldKey, string>>;
    const detectedHeaderRow = detectHeaderRow(rows, kind);
    const pastedHeaders = (rows[detectedHeaderRow] ?? []).map((value, index) => String(value ?? "").trim() || `Coluna ${index + 1}`);
    const detected = autoMapColumns(pastedHeaders);
    const allowedFields = new Set(allFields);
    return Object.fromEntries(
      Object.entries(detected).filter(([field]) => allowedFields.has(field as FieldKey)),
    ) as Partial<Record<FieldKey, string>>;
  }, [allFields, kind, pastedRowsWithFormatting, pastedText, rawRows.length]);

  async function handleFile(file: File) {
    try {
      debugDialog("upload:file:start", {
        kind,
        fileName: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
      });
      setFileName(file.name);
      if (file.name.toLowerCase().endsWith(".csv")) {
        const text = await file.text();
        const rows = parsePastedData(text);
        debugDialog("upload:csv:parsed", {
          kind,
          fileName: file.name,
          textLength: text.length,
          preview: text.slice(0, 500),
          rowCount: rows.length,
          rowsPreview: rows.slice(0, 10),
        });
        applyRawRows(rows);
        setSheetNames([]);
      } else {
        const wb = await parseExcelFile(file);
        debugDialog("upload:excel:parsed", {
          kind,
          fileName: file.name,
          sheetNames: wb.sheetNames,
          sheetSizes: Object.fromEntries(
            Object.entries(wb.sheets).map(([name, rows]) => [name, rows.length]),
          ),
        });
        setSheets(wb.sheets);
        setSheetNames(wb.sheetNames);
        const first = wb.sheetNames[0];
        setSelectedSheet(first);
        applyRawRows(wb.sheets[first] as unknown[][]);
      }
    } catch (e) {
      console.error("[IMPORT DEBUG][DIALOG] upload:file:error", e);
      toast.error("Não foi possível ler o arquivo. Verifique o formato.");
    }
  }

  function applyRawRows(rows: unknown[][]) {
    setRawRows(rows);
    const hIdx = detectHeaderRow(rows, kind);
    setHeaderRow(hIdx);
    const hdrs = (rows[hIdx] ?? []).map((h, i) => String(h ?? "").trim() || `Coluna ${i + 1}`);
    const detectedMapping = autoMapColumns(hdrs);
    const allowedFields = new Set(fieldsForKind(kind));
    const nextMapping = Object.fromEntries(
      Object.entries(detectedMapping).filter(([field]) => allowedFields.has(field as FieldKey)),
    ) as Partial<Record<FieldKey, string>>;
    debugDialog("rows:applied", {
      kind,
      rowCount: rows.length,
      headerRow: hIdx,
      headers: hdrs,
      mapping: nextMapping,
      firstRows: rows.slice(0, 10),
    });
    setMapping(nextMapping);
  }

  function handleSheetChange(name: string) {
    debugDialog("upload:sheet-change", {
      kind,
      previousSheet: selectedSheet,
      nextSheet: name,
      rowCount: sheets[name]?.length ?? 0,
    });
    setSelectedSheet(name);
    applyRawRows((sheets[name] ?? []) as unknown[][]);
  }

  function handleAnalyzePaste() {
    debugDialog("paste:analyze-click", {
      kind,
      textLength: pastedText.length,
      preview: pastedText.slice(0, 1000),
    });
    const rows = pastedRowsWithFormatting ?? parsePastedData(pastedText);
    debugDialog("paste:parsed", {
      kind,
      rowCount: rows.length,
      rowsPreview: rows.slice(0, 20),
    });
    if (rows.length === 0) {
      toast.error("Nenhum dado detectado.");
      return;
    }
    setFileName("Dados colados");
    applyRawRows(rows);
  }

  function handleConfirm() {
    const directPasteRows = rawRows.length > 0
      ? rawRows
      : (pastedRowsWithFormatting ?? parsePastedData(pastedText));
    const effectiveHeaderRow = rawRows.length > 0 ? headerRow : detectHeaderRow(directPasteRows, kind);
    const effectiveDataObjects = rawRows.length > 0
      ? dataObjects
      : rowsToObjects(directPasteRows, effectiveHeaderRow).data;
    const effectiveMapping = rawRows.length > 0 ? mapping : pastedCapturePreview;
    const missing = requiredFields.filter((f) => !effectiveMapping[f]);
    debugDialog("confirm:click", {
      kind,
      fileName: fileName || "Dados colados",
      selectedSheet,
      headerRow: effectiveHeaderRow,
      mapping: effectiveMapping,
      requiredFields,
      missing,
      dataObjectsCount: effectiveDataObjects.length,
      dataObjectsPreview: effectiveDataObjects.slice(0, 20),
    });
    if (missing.length > 0) {
      toast.error(`Escolha uma coluna para: ${missing.map((field) => FIELD_LABELS[field]).join(", ")}.`);
      return;
    }
    // Every card imports only the columns selected in this dialog. The full
    // row set is still passed separately for the one feature that needs it
    // (plate metadata), without changing the imported records themselves.
    const selectedRows = effectiveDataObjects.map((row) => {
      const filteredRow: Record<string, string> = {};
      for (const field of allFields) {
        const column = effectiveMapping[field];
        if (column) filteredRow[column] = row[column] ?? "";
      }
      return filteredRow;
    });
    debugDialog("confirm:rows-sent", {
      kind,
      count: selectedRows.length,
      rowsPreview: selectedRows.slice(0, 20),
    });
    onConfirm(selectedRows, effectiveMapping, fileName || "Dados colados", effectiveHeaderRow, selectedSheet || undefined, effectiveDataObjects);
    onOpenChange(false);
    resetState();
    toast.success("Importação concluída.");
  }

  const previewHeaders: string[] = allFields
    .map((f) => mapping[f])
    .filter((h): h is string => !!h);
  const preview = dataObjects.slice(0, 5);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) resetState();
      }}
    >
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Faça upload de um arquivo Excel/CSV ou cole os dados diretamente da planilha.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto pr-2 pb-4">
          <Tabs
            value={tab}
            onValueChange={(v) => {
              debugDialog("tab:change", { kind, previousTab: tab, nextTab: v });
              setTab(v as "upload" | "paste");
            }}
          >
            <TabsList>
              <TabsTrigger value="upload">
                <Upload className="w-4 h-4 mr-2" /> Upload
              </TabsTrigger>
              <TabsTrigger value="paste">
                <ClipboardPaste className="w-4 h-4 mr-2" /> Colar dados
              </TabsTrigger>
            </TabsList>
            <TabsContent value="upload" className="space-y-3">
              <div
                className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:bg-muted/40 transition"
                onClick={() => {
                  debugDialog("upload:dropzone-click", { kind, fileName, selectedSheet });
                  fileRef.current?.click();
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  debugDialog("upload:drag-over", { kind });
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  debugDialog("upload:drop", {
                    kind,
                    fileCount: e.dataTransfer.files?.length ?? 0,
                    fileName: f?.name,
                    size: f?.size,
                    type: f?.type,
                  });
                  if (f) handleFile(f);
                }}
              >
                <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Arraste um arquivo .xlsx, .xls ou .csv ou clique para selecionar
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    debugDialog("upload:file-input-change", {
                      kind,
                      fileCount: e.target.files?.length ?? 0,
                      fileName: f?.name,
                      size: f?.size,
                      type: f?.type,
                    });
                    if (f) handleFile(f);
                  }}
                />
              </div>
              {sheetNames.length > 0 && (
                <div>
                  <Label>Aba</Label>
                  <Select value={selectedSheet} onValueChange={handleSheetChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {sheetNames.map((n) => (
                        <SelectItem key={n} value={n}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </TabsContent>
            <TabsContent value="paste" className="space-y-3">
              <Textarea
                value={pastedText}
                onChange={(e) => {
                  debugDialog("paste:text-change", {
                    kind,
                    previousLength: pastedText.length,
                    nextLength: e.target.value.length,
                    preview: e.target.value.slice(0, 500),
                  });
                  setPastedRowsWithFormatting(null);
                  setPastedText(e.target.value);
                  setRawRows([]);
                  setMapping({});
                }}
                onPaste={(e) => {
                  const html = e.clipboardData.getData("text/html");
                  const text = e.clipboardData.getData("text/plain");
                  debugDialog("paste:event", {
                    kind,
                    htmlLength: html.length,
                    textLength: text.length,
                    textPreview: text.slice(0, 500),
                    htmlPreview: html.slice(0, 1000),
                    htmlRows: parsePastedHtmlData(html).length,
                  });
                  const rows = parsePastedHtmlData(html);
                  if (rows.length > 0) {
                    e.preventDefault();
                    debugDialog("paste:html-formatting-detected", {
                      kind,
                      rowCount: rows.length,
                      rowsPreview: rows.slice(0, 10),
                    });
                    setPastedRowsWithFormatting(rows);
                    setRawRows([]);
                    setMapping({});
                    setPastedText(
                      rows
                        .map((row) =>
                          row
                            .map((cell) =>
                              cell.replace(/\u200BFORMAT:(green|red|orange)\u200B/g, ""),
                            )
                            .join("\t"),
                        )
                        .join("\n"),
                    );
                  }
                }}
                placeholder="Copie as colunas diretamente do Excel, incluindo o cabeçalho, e cole aqui."
                className="min-h-40 font-mono text-xs"
              />
              <Button onClick={handleAnalyzePaste} variant="secondary">
                Analisar dados
              </Button>
              {pastedText.trim().length > 0 && rawRows.length === 0 && (
                <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary animate-in fade-in slide-in-from-left-2 duration-500">
                  <div className="flex items-center gap-2">
                    <ArrowRight className="h-4 w-4 shrink-0 animate-pulse" />
                    <span>Dados colados. Clique em <strong>“Analisar dados”</strong> para verificar as colunas capturadas e ajustá-las, se necessário.</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {requiredFields.map((field) => (
                      <span key={field} className={`rounded-full border px-2 py-0.5 text-xs ${pastedCapturePreview[field] ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                        {pastedCapturePreview[field]
                          ? `${captureFieldLabel(kind, field)}: “${pastedCapturePreview[field]}”`
                          : `${captureFieldLabel(kind, field)}: não identificada`}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>

          {rawRows.length > 0 && (
            <div className="space-y-3">
              <div>
                <Label>Linha do cabeçalho (0-indexada)</Label>
                <Select
                  value={String(headerRow)}
                  onValueChange={(v) => {
                    const idx = parseInt(v, 10);
                    debugDialog("header-row:change", {
                      kind,
                      previousHeaderRow: headerRow,
                      nextHeaderRow: idx,
                      rawHeader: rawRows[idx],
                    });
                    setHeaderRow(idx);
                    const hdrs = (rawRows[idx] ?? []).map(
                      (h, i) => String(h ?? "").trim() || `Coluna ${i + 1}`,
                    );
                    const detectedMapping = autoMapColumns(hdrs);
                    const allowedFields = new Set(fieldsForKind(kind));
                    const nextMapping = Object.fromEntries(
                      Object.entries(detectedMapping).filter(([field]) =>
                        allowedFields.has(field as FieldKey),
                      ),
                    ) as Partial<Record<FieldKey, string>>;
                    debugDialog("header-row:mapping-updated", {
                      kind,
                      headers: hdrs,
                      mapping: nextMapping,
                    });
                    setMapping(nextMapping);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {rawRows.slice(0, Math.min(10, rawRows.length)).map((_, i) => (
                      <SelectItem key={i} value={String(i)}>
                        Linha {i + 1}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                <div>
                  <p className="text-sm font-semibold">Colunas obrigatórias</p>
                  <p className="text-xs text-muted-foreground">Escolha abaixo qual coluna da planilha preenche cada campo. O nome do cabeçalho pode ser diferente: selecione a coluna que contém os dados corretos nas linhas. A seleção será usada em todo o sistema após a importação.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {requiredFields.map((field) => (
                    <span key={`required-${field}`} className="rounded bg-foreground px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-background">
                      {FIELD_LABELS[field]}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {requiredFields.map((field) => (
                    <span key={field} className={`rounded-full border px-2 py-1 text-xs ${mapping[field] ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                      {mapping[field] ? `${captureFieldLabel(kind, field)} capturando a coluna “${mapping[field]}”` : `${captureFieldLabel(kind, field)}: escolha uma coluna`}
                    </span>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {requiredFields.map((f) => (
                  <div key={f} className="space-y-1.5">
                    <Label>{FIELD_LABELS[f]}</Label>
                    <Select
                      value={mapping[f] ?? "__none__"}
                      onValueChange={(v) => {
                        debugDialog("mapping:manual-change", {
                          kind,
                          field: f,
                          previousColumn: mapping[f],
                          nextColumn: v === "__none__" ? undefined : v,
                        });
                        setMapping((m) => ({ ...m, [f]: v === "__none__" ? undefined : v }));
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— não mapear —</SelectItem>
                        {headers.map((h) => (
                          <SelectItem key={h} value={h}>
                            {h}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>

              <p className="hidden text-xs text-muted-foreground">
                Escolha as colunas que deseja capturar. A prÃ©-visualizaÃ§Ã£o e a importaÃ§Ã£o usarÃ£o somente estas colunas.
              </p>

              {optionalFields.length > 0 && (
                <details className="rounded-md border px-3 py-2">
                  <summary className="cursor-pointer text-sm font-medium">Campos adicionais opcionais</summary>
                  <p className="mt-1 text-xs text-muted-foreground">Use somente se sua planilha também possuir essas informações.</p>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {optionalFields.map((f) => (
                      <div key={f} className="space-y-1.5">
                        <Label>{FIELD_LABELS[f]}</Label>
                        <Select value={mapping[f] ?? "__none__"} onValueChange={(v) => setMapping((m) => ({ ...m, [f]: v === "__none__" ? undefined : v }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">— não capturar —</SelectItem>
                            {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              <div>
                <Label>Pré-visualização ({dataObjects.length} linhas)</Label>
                <div className="overflow-x-auto border rounded max-h-64">
                  <table className="w-full text-xs">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        {previewHeaders.map((h) => (
                          <th key={h} className="p-2 text-left font-medium">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((r, i) => (
                        <tr key={i} className="border-t">
                          {previewHeaders.map((h) => (
                            <td key={h} className="p-2">
                              {r[h]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 justify-center sm:justify-center bg-background pt-3 border-t">
          <Button
            variant="ghost"
            onClick={() => {
              debugDialog("cancel:click", {
                kind,
                fileName,
                selectedSheet,
                rowCount: dataObjects.length,
              });
              onOpenChange(false);
            }}
          >
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={dataObjects.length === 0 && !pastedText.trim()}>
            Confirmar importação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
