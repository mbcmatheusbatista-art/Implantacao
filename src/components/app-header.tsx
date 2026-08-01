import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { useRouterState } from "@tanstack/react-router";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
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
import { Moon, PanelLeftOpen, Sun, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAppStore } from "@/stores/app-store";

export function AppHeader() {
  const meta = useAppStore((s) => s.meta);
  const clearAll = useAppStore((s) => s.clearAll);
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (router) => router.location.pathname });
  const previousPathname = useRef<string | null>(null);
  const { setOpen: setSidebarOpen } = useSidebar();
  const isRoutingMap = pathname === "/roteirizacao";

  useEffect(() => {
    // A visualização do mapa precisa do máximo de área possível. Fazemos isso
    // somente ao entrar na rota, sem impedir que a pessoa reabra o menu depois.
    if (isRoutingMap && previousPathname.current !== pathname) {
      setSidebarOpen(false);
    }
    previousPathname.current = pathname;
  }, [isRoutingMap, pathname, setSidebarOpen]);

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
  if (meta.calls)
    badges.push({
      label: "Chamados e atendimentos",
      value: meta.calls.count,
      file: meta.calls.fileName,
    });

  const { theme, setTheme } = useTheme();

  return (
    <header className="h-14 flex items-center gap-3 border-b bg-card px-3 sticky top-0 z-10">
      <SidebarTrigger
        className={
          isRoutingMap
            ? "fixed left-10 top-2 z-[1200] h-9 w-9 rounded-md border bg-background shadow-sm hover:bg-accent"
            : undefined
        }
      />
      {isRoutingMap && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="fixed left-[5.25rem] top-[7.5rem] z-[2000] gap-1.5 bg-background shadow-md"
          onClick={() => setSidebarOpen(true)}
          title="Voltar ao menu lateral"
        >
          <PanelLeftOpen className="h-4 w-4" /> Voltar
        </Button>
      )}
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
      <Button
        variant="outline"
        size="sm"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        title={theme === "dark" ? "Modo claro" : "Modo escuro"}
      >
        {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </Button>
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
              Isto removerá contato com cliente, cliente com endereço, contatos aos técnicos,
              chamados e atendimentos e atribuições da sessão atual. A planilha original não é
              afetada.
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
