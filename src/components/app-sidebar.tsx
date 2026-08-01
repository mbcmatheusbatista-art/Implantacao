import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Home,
  Users,
  ClipboardCheck,
  Wrench,
  Share2,
  Settings,
  Navigation2,
  Calendar,
  ClipboardList,
  ListTodo,
  Database,
  Plus,
  Check,
  ClipboardCopy,
  MoreVertical,
  Headphones,
} from "lucide-react";
import { useEffect, useState } from "react";
import { copyShortcutToClipboard, sapWorkspace, type SapShortcut } from "@/services/sap-workspace";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const items = [
  { title: "Início", url: "/", icon: Home },
  { title: "Agendamentos", url: "/agendamentos", icon: Calendar },
  { title: "Contato com cliente", url: "/contatos-iniciais", icon: Users },
  { title: "Cliente com endereço", url: "/atendimentos", icon: ClipboardCheck },
  { title: "Contatar aos técnicos", url: "/tecnicos", icon: Wrench },
  { title: "Chamados e atendimentos", url: "/chamados", icon: Headphones },
  { title: "Distribuição de atendimentos", url: "/distribuicao", icon: Share2 },
  { title: "Roteirização por técnico", url: "/roteirizacao", icon: Navigation2 },
  { title: "Tarefas", url: "/tarefas", icon: ListTodo },
  { title: "Solicitações Adm", url: "/solicitacoes", icon: ClipboardList },
  { title: "Configurações de mensagens", url: "/configuracoes", icon: Settings },
];

export function AppSidebar() {
  const navigate = useNavigate();
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
  const [sapOpen, setSapOpen] = useState(false);
  const [shortcuts, setShortcuts] = useState<SapShortcut[]>([]);
  const [copiedShortcutId, setCopiedShortcutId] = useState<string | null>(null);
  const [contextItem, setContextItem] = useState<SapShortcut | null>(null);
  const [contextPosition, setContextPosition] = useState({ left: 208, top: 128 });
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (sapOpen)
      sapWorkspace
        .list()
        .then(setShortcuts)
        .catch(() => setShortcuts([]));
  }, [sapOpen, currentPath]);
  useEffect(() => {
    const sync = () => {
      if (sapOpen) reload();
    };
    window.addEventListener("sap-workspace-changed", sync);
    return () => window.removeEventListener("sap-workspace-changed", sync);
  }, [sapOpen]);
  useEffect(() => {
    if (!contextItem) return;
    const close = () => setContextItem(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [contextItem]);
  const reload = () =>
    sapWorkspace
      .list()
      .then(setShortcuts)
      .catch(() => setShortcuts([]));
  const copy = async (shortcut: SapShortcut) => {
    try {
      await copyShortcutToClipboard(shortcut.id);
      setCopiedShortcutId(shortcut.id);
      setMessage("Tabela copiada.");
    } catch {
      setMessage(
        "NÃ£o foi possÃ­vel copiar automaticamente. Autorize a Ã¡rea de transferÃªncia ou abra o menu de ediÃ§Ã£o.",
      );
    }
  };
  const edit = (shortcut: SapShortcut) => {
    setContextItem(null);
    navigate({ to: "/sap", search: { edit: shortcut.id } });
  };
  const rename = (shortcut: SapShortcut) => {
    edit(shortcut);
  };
  const duplicate = async (shortcut: SapShortcut) => {
    const item = await sapWorkspace.create(`${shortcut.name} - CÃ³pia`);
    await sapWorkspace.save({
      ...item,
      dataMatrix: shortcut.dataMatrix.map((row) => [...row]),
      columnWidths: [...shortcut.columnWidths],
      updatedAt: new Date().toISOString(),
    });
    setContextItem(null);
    reload();
  };
  const remove = async (shortcut: SapShortcut) => {
    await sapWorkspace.remove(shortcut.id);
    if (copiedShortcutId === shortcut.id) setCopiedShortcutId(null);
    setContextItem(null);
    reload();
  };
  const download = (name: string, data: string, type: string) => {
    const url = URL.createObjectURL(new Blob([data], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };
  const showContext = (shortcut: SapShortcut, point?: { x: number; y: number }) => {
    if (point)
      setContextPosition({
        left: Math.max(12, Math.min(point.x + 12, window.innerWidth - 240)),
        top: Math.max(12, Math.min(point.y + 12, window.innerHeight - 290)),
      });
    setContextItem(shortcut);
  };
  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Creare</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={currentPath === item.url}>
                    <Link to={item.url} className="flex items-center gap-2">
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => {
                    setSapOpen((open) => !open);
                    setCopiedShortcutId(null);
                  }}
                  isActive={currentPath === "/sap"}
                >
                  <Database className="h-4 w-4" />
                  <span>Orçamento</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {sapOpen &&
                shortcuts.map((shortcut) => (
                  <SidebarMenuItem
                    key={shortcut.id}
                    className="pl-5 flex items-center"
                    title={
                      copiedShortcutId === shortcut.id
                        ? shortcut.name
                        : "Clique para copiar. Clique com o botão direito para editar."
                    }
                  >
                    <SidebarMenuButton
                      className={
                        copiedShortcutId === shortcut.id ? "text-green-700 bg-green-50" : ""
                      }
                      onClick={() => copy(shortcut)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        showContext(shortcut, { x: event.clientX, y: event.clientY });
                      }}
                      onKeyDown={(event) => {
                        if (
                          (event.shiftKey && event.key === "F10") ||
                          event.key === "ContextMenu"
                        ) {
                          event.preventDefault();
                          const rect = event.currentTarget.getBoundingClientRect();
                          showContext(shortcut, { x: rect.right, y: rect.top });
                        }
                      }}
                    >
                      <span className="flex-1 truncate">
                        {copiedShortcutId === shortcut.id ? "Copiado" : shortcut.name}
                      </span>
                      {copiedShortcutId === shortcut.id ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <ClipboardCopy className="h-4 w-4" />
                      )}
                    </SidebarMenuButton>
                    <button
                      aria-label={`Administrar ${shortcut.name}`}
                      className="p-1"
                      onClick={(event) => {
                        event.stopPropagation();
                        const rect = event.currentTarget.getBoundingClientRect();
                        showContext(shortcut, { x: rect.right, y: rect.top });
                      }}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </SidebarMenuItem>
                ))}
              {sapOpen && (
                <SidebarMenuItem className="pl-5">
                  <SidebarMenuButton asChild>
                    <Link to="/sap" search={{ create: true }}>
                      <Plus className="h-4 w-4" />
                      Criar atalho
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
            {message && (
              <p role="status" className="px-2 pt-2 text-xs text-muted-foreground">
                {message}
              </p>
            )}
            {contextItem && (
              <div
                className="fixed z-50 w-52 max-w-[calc(100vw-1rem)] rounded-md border bg-background p-1 shadow-lg"
                style={contextPosition}
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  className="h-8 w-full rounded px-2 text-left text-sm hover:bg-muted"
                  onClick={() => edit(contextItem)}
                >
                  Editar tabela
                </button>
                <button
                  className="h-8 w-full rounded px-2 text-left text-sm hover:bg-muted"
                  onClick={() => rename(contextItem)}
                >
                  Renomear atalho
                </button>
                <button
                  className="h-8 w-full rounded px-2 text-left text-sm hover:bg-muted"
                  onClick={() => duplicate(contextItem)}
                >
                  Duplicar atalho
                </button>
                <button
                  className="h-8 w-full rounded px-2 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    download(
                      `${contextItem.name}.tsv`,
                      contextItem.dataMatrix.map((row) => row.join("\t")).join("\n"),
                      "text/tab-separated-values",
                    );
                    setContextItem(null);
                  }}
                >
                  Exportar TSV
                </button>
                <button
                  className="h-8 w-full rounded px-2 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    download(
                      `${contextItem.name}-backup.json`,
                      JSON.stringify(contextItem, null, 2),
                      "application/json",
                    );
                    setContextItem(null);
                  }}
                >
                  Exportar backup JSON
                </button>
                <button
                  className="h-8 w-full rounded px-2 text-left text-sm text-destructive hover:bg-muted"
                  onClick={() => remove(contextItem)}
                >
                  Excluir atalho
                </button>
              </div>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
