import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Users, ClipboardCheck, Wrench, Share2, Activity, Settings, Navigation2 } from "lucide-react";
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
  { title: "Contato com cliente", url: "/contatos-iniciais", icon: Users },
  { title: "Cliente com endereço", url: "/atendimentos", icon: ClipboardCheck },
  { title: "Contatar aos técnicos", url: "/tecnicos", icon: Wrench },
  { title: "Distribuição de atendimentos", url: "/distribuicao", icon: Share2 },
  { title: "Roteirização por técnico", url: "/roteirizacao", icon: Navigation2 },
  { title: "Diagnóstico das importações", url: "/diagnostico", icon: Activity },
  { title: "Configurações de mensagens", url: "/configuracoes", icon: Settings },
];

export function AppSidebar() {
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
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
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
