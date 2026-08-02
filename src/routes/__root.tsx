import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import { hydrateFromDb, useAppStore } from "@/stores/app-store";
import { useSyncD1Tecnicos } from "@/services/use-d1-tecnicos";
import { useSyncSupabaseTecnicos } from "@/services/use-supabase-tecnicos";
import { getSeedTechnicians } from "@/services/seed-data";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A página que você procura não existe ou foi movida.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Ir para o início
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Algo deu errado</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ocorreu um erro inesperado. Tente novamente ou volte para o início.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Tentar novamente
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Ir para o início
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Assistente Creare — Contatos e Agendamentos" },
      {
        name: "description",
        content:
          "Ferramenta local para organizar contatos, técnicos e agendamentos da Creare Sistemas.",
      },
      { name: "author", content: "Creare Sistemas" },
      { property: "og:title", content: "Assistente Creare — Contatos e Agendamentos" },
      {
        property: "og:description",
        content:
          "Ferramenta local para organizar contatos, técnicos e agendamentos da Creare Sistemas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Assistente Creare — Contatos e Agendamentos" },
      {
        name: "twitter:description",
        content:
          "Ferramenta local para organizar contatos, técnicos e agendamentos da Creare Sistemas.",
      },
      {
        property: "og:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/d3d68fac-6c21-4cdd-80b6-c8eff7f8d0e0/id-preview-08b08a96--08cffd64-cdac-4109-8985-67672ba4ef37.lovable.app-1783748026806.png",
      },
      {
        name: "twitter:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/d3d68fac-6c21-4cdd-80b6-c8eff7f8d0e0/id-preview-08b08a96--08cffd64-cdac-4109-8985-67672ba4ef37.lovable.app-1783748026806.png",
      },
      { title: "Assistente implantação" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/assistente-implantacao.svg", type: "image/svg+xml" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    hydrateFromDb();
  }, []);

  useEffect(() => {
    const { technicians, setTechnicians } = useAppStore.getState();
    if (technicians.length > 0) return;
    const seed = getSeedTechnicians();
    setTechnicians(
      seed,
      { fileName: "seed", count: seed.length },
      {
        fileName: "seed",
        headerRow: 0,
        columnsFound: [],
        columnsMapped: {},
        columnsUnmapped: [],
        rowsImported: seed.length,
        rowsSkipped: 0,
        invalidPhones: 0,
        emptyPlates: 0,
        emptyNames: 0,
        emptyAddresses: 0,
        equipmentUnknown: 0,
        quantityUnparsed: 0,
        groupedContacts: 0,
        nameConflicts: 0,
        timestamp: Date.now(),
      },
    );
  }, []);

  useSyncD1Tecnicos();
  useSyncSupabaseTecnicos();

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <SidebarProvider>
          <div className="min-h-screen flex w-full bg-background">
            <AppSidebar />
            <div className="flex-1 flex flex-col min-w-0">
              <AppHeader />
              <main className="flex-1 p-4 md:p-6 overflow-x-hidden">
                <Outlet />
              </main>
            </div>
          </div>
          <Toaster />
        </SidebarProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
