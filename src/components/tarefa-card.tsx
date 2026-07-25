import { useMemo } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OkBadge } from "@/components/ok-badge";
import { useTaskStore } from "@/stores/task-store";

export const CHECKLIST_STEPS = [
  "Contato com o cliente",
  "Confirmação do endereço",
  "Definição do técnico",
  "Disponibilidade de equipamento",
  "Verificação da agenda",
  "Retorno e agendamento com o cliente",
  "Agendar no chamado",
  "Lançar pré-orçamento",
  "Um dia antes",
  "Criar grupo no WhatsApp",
  "Confirmar atendimento com o técnico",
  "Confirmar atendimento com o cliente",
  "Encerramento",
  "Conferir FAT",
  "Finalizar chamado",
  "Conferir deslocamento do técnico",
  "Conferir gastos (pedágios)",
  "Finalizar orçamento",
  "Preenchimento automático",
] as const;

export type StepKey = (typeof CHECKLIST_STEPS)[number];

interface TarefaCardProps {
  plate: string;
  responsible: string;
  city: string | null;
  state: string | null;
  status: string | undefined;
  statusOriginal: string | undefined;
  hasAddress: boolean;
}

const FINALIZADO_STEPS: ReadonlySet<StepKey> = new Set([
  "Definição do técnico",
  "Disponibilidade de equipamento",
  "Verificação da agenda",
  "Retorno e agendamento com o cliente",
  "Agendar no chamado",
  "Lançar pré-orçamento",
  "Um dia antes",
  "Criar grupo no WhatsApp",
  "Confirmar atendimento com o técnico",
  "Confirmar atendimento com o cliente",
  "Encerramento",
]);

function getAutoValue(
  step: StepKey,
  hasAddress: boolean,
  status: string | undefined,
  isFinalizado: boolean,
  statusOriginal: string | undefined,
): string {
  const orig = (statusOriginal ?? "").trim().toUpperCase();
  if (orig === "COM MOBI7") return "";
  if (isFinalizado && FINALIZADO_STEPS.has(step)) return "OK";
  if (step === "Contato com o cliente" && hasAddress) return "OK";
  if (step === "Confirmação do endereço" && hasAddress) return "OK";
  if (status === "AGENDADO") {
    if (step === "Definição do técnico") return "OK";
    if (step === "Disponibilidade de equipamento") return "OK";
    if (step === "Verificação da agenda") return "OK";
    if (step === "Retorno e agendamento com o cliente") return "OK";
    if (step === "Agendar no chamado") return "OK";
  }
  return "";
}

export function TarefaCard({ plate, responsible, city, state, status, statusOriginal, hasAddress }: TarefaCardProps) {
  const manualChecklist = useTaskStore((s) => s.manualChecklist);
  const updateStep = useTaskStore((s) => s.updateStep);
  const plateManual = manualChecklist[plate] ?? {};

  const isFinalizado =
    status === "FINALIZADO" || (statusOriginal ?? "").toUpperCase() === "FINALIZADO";

  function getEffectiveValue(step: StepKey): string {
    if (plateManual[step] !== undefined) return plateManual[step];
    return getAutoValue(step, hasAddress, status, isFinalizado, statusOriginal);
  }

  const statusBadge = useMemo(() => {
    const displayStatus = isFinalizado && status !== "FINALIZADO" ? "FINALIZADO" : status;
    if (!displayStatus) return null;
    const classes: Record<string, string> = {
      AGENDADO: "bg-blue-600 hover:bg-blue-700",
      AGENDAR: "bg-orange-500 hover:bg-orange-600",
      AGENDANDO: "bg-black hover:bg-gray-900",
      FINALIZADO: "bg-emerald-600 hover:bg-emerald-700",
    };
    return (
      <Badge className={classes[displayStatus] ?? ""}>
        {displayStatus}
      </Badge>
    );
  }, [status, isFinalizado]);

  return (
    <Card className="break-inside-avoid">
      <CardHeader className="pb-3 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-lg font-bold tracking-wide">{plate}</span>
          {statusBadge}
        </div>
        <div className="text-sm text-muted-foreground">
          <span className="font-medium">{responsible}</span>
        </div>
        <div className="text-xs text-muted-foreground">
          {[city, state].filter(Boolean).join(", ") || "—"}
        </div>
      </CardHeader>
      <CardContent className="space-y-1.5">
        <div className="text-xs font-semibold text-muted-foreground mb-2">Checklist</div>
        {CHECKLIST_STEPS.map((step) => {
          const effective = getEffectiveValue(step);
          const isManual = plateManual[step] !== undefined;
          const isOk = effective === "OK";

          return (
            <div key={step} className="flex items-center gap-2">
              <div className="flex-1 text-xs text-foreground">{step}</div>
              <button
                type="button"
                className="cursor-pointer"
                onClick={() => updateStep(plate, step, isOk ? "" : "OK")}
                title={isOk ? "Clique para remover" : "Clique para marcar OK"}
              >
                {isOk ? (
                  <OkBadge />
                ) : (
                  <span className="text-xs text-muted-foreground border border-dashed rounded px-2 py-0.5 hover:border-foreground">
                    Pendente
                  </span>
                )}
              </button>
              {isManual && isOk && (
                <span className="text-[10px] text-muted-foreground">manual</span>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
