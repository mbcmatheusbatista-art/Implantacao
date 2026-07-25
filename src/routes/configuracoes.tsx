import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Settings, RotateCcw } from "lucide-react";
import {
  DEFAULT_TEMPLATES,
  loadTemplates,
  saveTemplates,
  type MessageTemplates,
} from "@/services/messages";

export const Route = createFileRoute("/configuracoes")({
  component: ConfigPage,
});

function ConfigPage() {
  const [t, setT] = useState<MessageTemplates>(() => loadTemplates());

  function save() {
    saveTemplates(t);
    toast.success("Modelos salvos.");
  }
  function reset() {
    setT(DEFAULT_TEMPLATES);
    saveTemplates(DEFAULT_TEMPLATES);
    toast.success("Modelos restaurados.");
  }

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Settings className="w-6 h-6" /> Configurações de mensagens
          </h1>
          <p className="text-sm text-muted-foreground">
            Edite os modelos usados para responsáveis e técnicos. Os modelos ficam salvos apenas neste navegador.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={reset}>
            <RotateCcw className="w-4 h-4 mr-2" /> Restaurar padrão
          </Button>
          <Button onClick={save}>Salvar</Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Variáveis disponíveis</CardTitle>
        </CardHeader>
        <CardContent className="text-xs grid grid-cols-2 md:grid-cols-3 gap-2 font-mono">
          <div>{"{saudacao}"}</div>
          <div>{"{primeiro_nome}"}</div>
          <div>{"{primeiro_nome_tecnico}"}</div>
          <div>{"{placa}"}</div>
          <div>{"{placas}"}</div>
          <div>{"{equipamento}"}</div>
          <div>{"{responsavel}"}</div>
          <div>{"{endereco}"}</div>
          <div>{"{cidade}"}</div>
          <div>{"{uf}"}</div>
          <div>{"{data}"}</div>
          <div>{"{horario}"}</div>
          <div>{"{atendimentos}"}</div>
        </CardContent>
      </Card>

      {(
        [
          ["responsibleSingle", "Responsável — placa única"],
          ["responsibleMultiple", "Responsável — várias placas"],
          ["technicianSingle", "Técnico — atendimento único"],
          ["technicianMultiple", "Técnico — vários atendimentos"],
        ] as [keyof MessageTemplates, string][]
      ).map(([key, label]) => (
        <Card key={key}>
          <CardHeader>
            <CardTitle className="text-sm">{label}</CardTitle>
          </CardHeader>
          <CardContent>
            <Label className="sr-only">{label}</Label>
            <Textarea
              value={t[key]}
              onChange={(e) => setT((prev) => ({ ...prev, [key]: e.target.value }))}
              className="min-h-40 font-mono text-xs"
            />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
