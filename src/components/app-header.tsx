import { useState } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAppStore } from "@/stores/app-store";

export function AppHeader() {
  const meta = useAppStore((s) => s.meta);
  const clearAll = useAppStore((s) => s.clearAll);
  const [open, setOpen] = useState(false);

  const badges: { label: string; value: number; file?: string }[] = [];
  if (meta.initial)
    badges.push({
      label: "Contato com cliente",
      value: meta.initial.count,
      file: meta.initial.fileName,
    });
  if (meta.confirmed)
    badges.push({
      label: "Cliente com endereço",
      value: meta.confirmed.count,
      file: meta.confirmed.fileName,
    });
  if (meta.technicians)
    badges.push({
      label: "Contatar aos técnicos",
      value: meta.technicians.count,
      file: meta.technicians.fileName,
    });

  return (
    <header className="h-14 flex items-center gap-3 border-b bg-card px-3 sticky top-0 z-10">
      <SidebarTrigger />
      <div className="flex-1 min-w-0">
        <h1 className="text-sm font-semibold truncate">
          Assistente de Contatos e Agendamentos Creare
        </h1>
        <div className="flex gap-2 mt-0.5 flex-wrap">
          {badges.map((b) => (
            <Badge key={b.label} variant="secondary" className="text-[10px] font-normal">
              {b.label}: {b.value}
            </Badge>
          ))}
        </div>
      </div>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Trash2 className="w-4 h-4 mr-2" /> Limpar sessão
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar todos os dados carregados?</AlertDialogTitle>
            <AlertDialogDescription>
              Isto removerá contato com cliente, cliente com endereço, contatos aos técnicos e
              atribuições da sessão atual. A planilha original não é afetada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                clearAll();
                toast.success("Sessão limpa.");
              }}
            >
              Limpar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}
