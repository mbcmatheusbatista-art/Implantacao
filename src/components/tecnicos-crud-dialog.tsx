import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Pencil, RefreshCw, Search, Trash2, UserPlus, Wrench } from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import {
  deletarTecnicoSupabase,
  listarTecnicosSupabase,
} from "@/services/supabase";
import type { Technician } from "@/types";
import TecnicosCadastroDialog from "@/components/tecnicos-cadastro-dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Busca o id numérico do Supabase a partir do id do Technician (`supabase_<id>`). */
function supabaseIdOf(t: Technician): number | null {
  const id = Number(t.id.replace("supabase_", ""));
  return Number.isFinite(id) && id > 0 ? id : null;
}

export default function TecnicosCrudDialog({ open, onOpenChange }: Props) {
  const technicians = useAppStore((s) => s.technicians);

  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Technician | null>(null);
  const [cadastroOpen, setCadastroOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Technician | null>(null);

  // Técnicos criados via Supabase (origem supabase_).
  const supabaseTechs = useMemo(
    () => technicians.filter((t) => t.id.startsWith("supabase_")),
    [technicians],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("pt-BR");
    return supabaseTechs.filter((t) => {
      if (!q) return true;
      return [t.nameOriginal, t.cityOriginal, t.state, t.phoneOriginal, t.cnpj, t.address]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("pt-BR")
        .includes(q);
    });
  }, [supabaseTechs, search]);

  async function refresh() {
    setLoading(true);
    try {
      const rows = await listarTecnicosSupabase();
      const liveIds = new Set(rows.map((r) => `supabase_${r.id}`));
      const next = technicians.filter((t) => !t.id.startsWith("supabase_") || liveIds.has(t.id));
      const state = useAppStore.getState();
      state.setTechnicians(
        next,
        state.meta?.technicians || { fileName: "", count: next.length },
        state.diagnostics?.technicians || {
          fileName: "",
          columnsFound: [],
          columnsMapped: {},
          columnsUnmapped: [],
          rowsImported: next.length,
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
          headerRow: 0,
        },
      );
      toast.success("Lista atualizada.");
    } catch (err) {
      console.error("[SUPABASE] Erro ao atualizar lista:", err);
      toast.error("Falha ao atualizar a lista.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(t: Technician) {
    const id = supabaseIdOf(t);
    if (!id) return;
    setLoading(true);
    try {
      await deletarTecnicoSupabase(id);
      const next = technicians.filter((x) => x.id !== t.id);
      const state = useAppStore.getState();
      state.setTechnicians(
        next,
        state.meta?.technicians || { fileName: "", count: next.length },
        state.diagnostics?.technicians || {
          fileName: "",
          columnsFound: [],
          columnsMapped: {},
          columnsUnmapped: [],
          rowsImported: next.length,
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
          headerRow: 0,
        },
      );
      toast.success("Técnico excluído.");
      setConfirmDelete(null);
    } catch (err) {
      console.error("[SUPABASE] Erro ao excluir técnico:", err);
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      toast.error(`Falha ao excluir técnico: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  function handleEdit(t: Technician) {
    setEditing(t);
    setCadastroOpen(true);
  }

  function handleNew() {
    setEditing(null);
    setCadastroOpen(true);
  }

  useEffect(() => {
    if (open) {
      setSearch("");
      setEditing(null);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="w-5 h-5" /> Técnicos cadastrados
          </DialogTitle>
          <DialogDescription>
            {supabaseTechs.length} técnicos criados no portal. É possível editar, excluir ou cadastrar
            um novo.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, cidade, UF, telefone, CNPJ, endereço"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <Button variant="outline" size="icon" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={"w-4 h-4" + (loading ? " animate-spin" : "")} />
          </Button>
          <Button size="sm" onClick={handleNew}>
            <UserPlus className="w-4 h-4 mr-2" /> Novo
          </Button>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="py-10 text-center text-muted-foreground">
              {search ? "Nenhum técnico encontrado." : "Nenhum técnico cadastrado ainda."}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted sticky top-0">
                <tr className="text-left">
                  <th className="p-2">Nome</th>
                  <th className="p-2">Cidade</th>
                  <th className="p-2">UF</th>
                  <th className="p-2">Endereço</th>
                  <th className="p-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id} className="border-t hover:bg-muted/30">
                    <td className="p-2">
                      <div className="font-medium">{t.nameOriginal || "—"}</div>
                      {t.cnpj && <div className="text-xs text-muted-foreground">{t.cnpj}</div>}
                    </td>
                    <td className="p-2">{t.cityOriginal || "—"}</td>
                    <td className="p-2">
                      {t.state ? (
                        <Badge variant="secondary">{t.state}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-2 max-w-44 truncate text-xs" title={t.address || ""}>
                      {t.address ? (
                        <span className="text-green-700 dark:text-green-400">{t.address}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-2">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEdit(t)}
                          title="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setConfirmDelete(t)}
                          disabled={loading}
                          title="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <TecnicosCadastroDialog
          open={cadastroOpen}
          onOpenChange={setCadastroOpen}
          editing={editing}
        />
      </DialogContent>

      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        clickOutsideToClose
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir técnico</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o técnico <strong>{confirmDelete?.nameOriginal}</strong>?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={loading}
              onClick={() => confirmDelete && void handleDelete(confirmDelete)}
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}