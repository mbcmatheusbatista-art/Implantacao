import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Pencil, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ConfirmedService, ImportKind, InitialContact, Technician } from "@/types";
import { normalizeBrazilianPhone } from "@/utils/normalize-phone";
import { normalizeEquipment } from "@/utils/normalize-equipment";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ImportRecord = InitialContact | ConfirmedService | Technician;

type Field = { key: string; label: string };

const FIELDS: Record<ImportKind, Field[]> = {
  initial: [
    { key: "plateOriginal", label: "Placa" },
    { key: "responsibleOriginal", label: "Responsável" },
    { key: "phoneOriginal", label: "Telefone" },
    { key: "matrixOriginal", label: "Matriz" },
  ],
  confirmed: [
    { key: "plateOriginal", label: "Placa" },
    { key: "responsibleOriginal", label: "Responsável" },
    { key: "phoneOriginal", label: "Telefone" },
    { key: "fullAddress", label: "Endereço" },
    { key: "equipmentOriginal", label: "Equipamento" },
    { key: "serviceStatusOriginal", label: "Status" },
    { key: "technicianOriginal", label: "Técnico vinculado" },
  ],
  technicians: [
    { key: "nameOriginal", label: "Técnico" },
    { key: "phoneOriginal", label: "Celular" },
    { key: "cityOriginal", label: "Cidade" },
    { key: "state", label: "UF" },
    { key: "address", label: "Endereço" },
  ],
};

function recordName(kind: ImportKind, record: ImportRecord) {
  if (kind === "technicians") return (record as Technician).nameOriginal;
  return (record as InitialContact | ConfirmedService).responsibleOriginal;
}

function updateRecord(kind: ImportKind, record: ImportRecord, values: Record<string, string>): ImportRecord {
  const next = { ...record, ...values } as ImportRecord;
  const phone = normalizeBrazilianPhone(values.phoneOriginal ?? record.phoneOriginal);
  next.phoneOriginal = values.phoneOriginal ?? record.phoneOriginal;
  next.phoneNormalized = phone.primary;

  if (kind === "initial") {
    const item = next as InitialContact;
    item.allPhones = phone.all;
    item.firstName = item.responsibleOriginal.trim().split(/\s+/)[0] || "";
    item.plateNormalized = item.plateOriginal.replace(/[^a-z0-9]/gi, "").toUpperCase();
    item.validationIssues = [
      ...(!item.plateOriginal.trim() ? ["Placa vazia"] : []),
      ...(!item.responsibleOriginal.trim() ? ["Responsável vazio"] : []),
      ...(phone.status !== "valid" ? [phone.reason ?? "Telefone vazio"] : []),
    ];
  } else if (kind === "confirmed") {
    const item = next as ConfirmedService;
    item.firstName = item.responsibleOriginal.trim().split(/\s+/)[0] || "";
    item.plateNormalized = item.plateOriginal.replace(/[^a-z0-9]/gi, "").toUpperCase();
    item.validationIssues = [
      ...(!item.plateOriginal.trim() ? ["Placa vazia"] : []),
      ...(!item.responsibleOriginal.trim() ? ["Responsável vazio"] : []),
      ...(!item.fullAddress.trim() ? ["Endereço vazio"] : []),
      ...(normalizeEquipment(item.equipmentOriginal) === "NAO_IDENTIFICADO" ? ["Equipamento não identificado"] : []),
      ...(phone.status !== "valid" ? [phone.reason ?? "Telefone vazio"] : []),
    ];
  } else {
    const item = next as Technician;
    item.allPhones = phone.all;
    item.firstName = item.nameOriginal.trim().split(/\s+/)[0] || "";
    item.cityNormalized = item.cityOriginal.trim().toUpperCase();
    item.state = item.state.trim().toUpperCase();
    item.validationIssues = [
      ...(!item.nameOriginal.trim() ? ["Nome vazio"] : []),
      ...(!item.cityOriginal.trim() ? ["Cidade vazia"] : []),
      ...(!item.state.trim() ? ["UF vazia"] : []),
      ...(phone.status !== "valid" ? [phone.reason ?? "Telefone vazio"] : []),
    ];
  }

  return next;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: ImportKind;
  records: ImportRecord[];
  onChange: (records: ImportRecord[]) => void;
}

export function ImportProblemsDialog({ open, onOpenChange, kind, records, onChange }: Props) {
  const problems = useMemo(
    () => records.filter((record) => record.validationIssues?.length > 0),
    [records],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const selected = problems.find((record) => record.id === selectedId) ?? problems[0];

  useEffect(() => {
    if (!open) return;
    const first = problems[0];
    setSelectedId(first?.id ?? null);
  }, [open, problems]);

  useEffect(() => {
    if (!selected) {
      setDraft({});
      return;
    }
    setDraft(
      Object.fromEntries(FIELDS[kind].map(({ key }) => [key, String((selected as Record<string, unknown>)[key] ?? "")])),
    );
  }, [kind, selected]);

  function save() {
    if (!selected) return;
    const next = records.map((record) =>
      record.id === selected.id ? updateRecord(kind, record, draft) : record,
    );
    onChange(next);
    toast.success("Alterações salvas.", { description: "Os dados foram atualizados neste card." });
  }

  function remove() {
    if (!selected) return;
    const next = records.filter((record) => record.id !== selected.id);
    onChange(next);
    setSelectedId(next.find((record) => record.validationIssues?.length > 0)?.id ?? null);
    toast.success("Registro excluído.");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle>Revisar registros com problemas</DialogTitle>
          <DialogDescription>
            Veja o motivo indicado em cada linha, ajuste os dados e salve. Você também pode excluir ou renomear o registro.
          </DialogDescription>
        </DialogHeader>
        {problems.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">Não há mais registros com problemas neste card.</div>
        ) : (
          <div className="grid md:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.4fr)] min-h-0 max-h-[62vh]">
            <aside className="border-r overflow-y-auto p-3 space-y-2 bg-muted/30">
              {problems.map((record) => (
                <button
                  key={record.id}
                  type="button"
                  onClick={() => setSelectedId(record.id)}
                  className={`w-full text-left rounded-md border p-3 transition-colors ${selected?.id === record.id ? "border-primary bg-background shadow-sm" : "bg-background hover:border-primary/50"}`}
                >
                  <p className="font-medium text-sm truncate">{recordName(kind, record) || "Sem nome"}</p>
                  <p className="mt-1 text-xs text-destructive line-clamp-2">{record.validationIssues.join(" • ")}</p>
                </button>
              ))}
            </aside>
            {selected && (
              <section className="overflow-y-auto p-5 space-y-5">
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                  <p className="flex items-center gap-2 font-medium text-sm text-destructive"><AlertCircle className="w-4 h-4" /> O que precisa ser corrigido</p>
                  <ul className="mt-2 list-disc pl-5 text-sm space-y-1">
                    {selected.validationIssues.map((issue) => <li key={issue}>{issue}</li>)}
                  </ul>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  {FIELDS[kind].map((field) => (
                    <label key={field.key} className="grid gap-1.5 text-sm font-medium">
                      {field.label}
                      <Input
                        value={draft[field.key] ?? ""}
                        onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))}
                      />
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Para renomear, altere o campo {kind === "technicians" ? "Técnico" : "Responsável"} e clique em salvar.</p>
                <div className="flex flex-wrap justify-between gap-2 pt-1">
                  <Button variant="destructive" onClick={remove}><Trash2 className="w-4 h-4 mr-2" /> Excluir registro</Button>
                  <Button onClick={save}><Save className="w-4 h-4 mr-2" /> Salvar alterações</Button>
                </div>
              </section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
