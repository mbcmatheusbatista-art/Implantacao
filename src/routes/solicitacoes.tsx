import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ClipboardList, MessageCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAppStore } from "@/stores/app-store";
import { loadFromDb, saveToDb } from "@/services/db";
import type { ConfirmedService } from "@/types";
import { buildWhatsAppUrl } from "@/utils/whatsapp-url";

export const Route = createFileRoute("/solicitacoes")({ component: SolicitacoesPage });

type AdminContact = { id: string; name: string; phone: string; isDefault?: boolean };
const DEFAULT_ADMINS: AdminContact[] = [
  { id: "rogerio", name: "Rogério", phone: "11 9 4175-4926", isDefault: true },
  { id: "fernando", name: "Fernando", phone: "", isDefault: true },
];

function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function includesAdministrator(observations: string, name: string) {
  const cleanName = normalize(name).trim();
  if (!cleanName) return false;
  const escapedName = cleanName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z])${escapedName}(?=$|[^a-z])`).test(normalize(observations));
}

function SolicitacoesPage() {
  const confirmedServices = useAppStore((s) => s.confirmedServices);
  const [admins, setAdmins] = useState<AdminContact[]>(DEFAULT_ADMINS);
  const [selectedId, setSelectedId] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [editingAdminId, setEditingAdminId] = useState<string | null>(null);
  const [editingService, setEditingService] = useState<ConfirmedService | null>(null);
  const [serviceDraft, setServiceDraft] = useState<Partial<ConfirmedService>>({});

  useEffect(() => {
    loadFromDb<AdminContact[]>("adminContacts").then((saved) => {
      if (!saved?.length) return;
      const defaults = DEFAULT_ADMINS.map((base) => saved.find((item) => item.id === base.id) ?? base);
      setAdmins([...defaults, ...saved.filter((item) => !DEFAULT_ADMINS.some((base) => base.id === item.id))]);
    }).catch(() => {});
  }, []);

  const selected = admins.find((admin) => admin.id === selectedId);
  const filtered = useMemo(() => !selected ? [] : confirmedServices.filter((service) => includesAdministrator(service.observationsOriginal ?? "", selected.name)), [confirmedServices, selected]);
  const persistAdmins = (next: AdminContact[]) => { setAdmins(next); saveToDb("adminContacts", next).catch(() => toast.error("Não foi possível salvar os contatos.")); };

  const saveContact = () => {
    const name = contactName.trim();
    if (!name) { toast.error("Informe o nome do administrador."); return; }
    if (admins.some((admin) => normalize(admin.name) === normalize(name) && admin.id !== editingAdminId)) { toast.error("Já existe um administrador com este nome."); return; }
    if (editingAdminId) {
      persistAdmins(admins.map((admin) => admin.id === editingAdminId ? { ...admin, name, phone: contactPhone.trim() } : admin));
      toast.success("Contato atualizado.");
    } else {
      const added = { id: `admin-${crypto.randomUUID()}`, name, phone: contactPhone.trim() };
      persistAdmins([...admins, added]); setSelectedId(added.id); toast.success("Administrador adicionado.");
    }
    setContactName(""); setContactPhone(""); setEditingAdminId(null);
  };
  const deleteAdmin = (admin: AdminContact) => {
    if (admin.isDefault) { toast.error("Rogério e Fernando permanecem disponíveis como contatos padrão."); return; }
    if (!window.confirm(`Excluir o contato ${admin.name}?`)) return;
    persistAdmins(admins.filter((item) => item.id !== admin.id)); if (selectedId === admin.id) setSelectedId(""); toast.success("Contato excluído.");
  };
  const buildTableMessage = (services: ConfirmedService[]) => `${"*Placa*    *Nome do Responsável*    *Telefone*    *Observações / Particularidades*"}\n${services.map((s) => `${s.plateOriginal || "-"}     ${s.responsibleOriginal || "-"}     ${s.phoneOriginal || "-"}     ${s.observationsOriginal || "-"}`).join("\n")}`;
  const administratorWhatsAppUrl = selected?.phone ? buildWhatsAppUrl(selected.phone, buildTableMessage(filtered)) : null;
  const saveServiceEdit = () => {
    if (!editingService) return;
    const updated = confirmedServices.map((service) => service.id === editingService.id ? { ...service, ...serviceDraft } : service);
    useAppStore.setState({ confirmedServices: updated }); saveToDb("confirmedServices", updated).catch(() => toast.error("Não foi possível salvar a alteração.")); setEditingService(null); toast.success("Solicitação atualizada.");
  };
  const deleteService = (service: ConfirmedService) => {
    if (!window.confirm(`Excluir a solicitação da placa ${service.plateOriginal || "sem placa"}?`)) return;
    const updated = confirmedServices.filter((item) => item.id !== service.id);
    useAppStore.setState({ confirmedServices: updated }); saveToDb("confirmedServices", updated).catch(() => toast.error("Não foi possível excluir a solicitação.")); toast.success("Solicitação excluída.");
  };

  return <div className="space-y-6 max-w-7xl mx-auto">
    <div><h1 className="text-2xl font-bold flex items-center gap-2"><ClipboardList className="w-6 h-6" />Solicitações Adm</h1><p className="text-muted-foreground mt-1">Filtre as solicitações pelo administrador responsável.</p></div>
    <Card><CardHeader><CardTitle className="text-base">Contato do administrador</CardTitle></CardHeader><CardContent className="space-y-4">
      <div className="flex flex-wrap items-center gap-3"><Input placeholder="Nome do administrador" className="max-w-xs" value={contactName} onChange={(e) => setContactName(e.target.value)} /><Input placeholder="Número de contato" className="max-w-xs" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} /><Button size="sm" onClick={saveContact}>{editingAdminId ? "Salvar edição" : <><Plus className="mr-2 h-4 w-4" />Adicionar</>}</Button>{editingAdminId && <Button size="sm" variant="outline" onClick={() => { setEditingAdminId(null); setContactName(""); setContactPhone(""); }}>Cancelar</Button>}</div>
      <div className="space-y-2">{admins.map((admin) => <div key={admin.id} className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm"><span className="font-medium">{admin.name}</span><span className="text-muted-foreground">{admin.phone || "Sem telefone cadastrado"}</span><div className="ml-auto flex gap-1"><Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingAdminId(admin.id); setContactName(admin.name); setContactPhone(admin.phone); }} aria-label={`Editar ${admin.name}`}><Pencil className="h-3.5 w-3.5" /></Button>{!admin.isDefault && <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteAdmin(admin)} aria-label={`Excluir ${admin.name}`}><Trash2 className="h-3.5 w-3.5" /></Button>}</div></div>)}</div>
    </CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">Selecionar administrador</CardTitle></CardHeader><CardContent><div className="flex items-center gap-3"><div className="max-w-xs"><Select value={selectedId} onValueChange={setSelectedId}><SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger><SelectContent>{admins.map((admin) => <SelectItem key={admin.id} value={admin.id}>{admin.name}</SelectItem>)}</SelectContent></Select></div>{selected && (administratorWhatsAppUrl ? <a href={administratorWhatsAppUrl} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="outline"><MessageCircle className="w-4 h-4 mr-2" />WhatsApp</Button></a> : <Button size="sm" variant="outline" onClick={() => toast.error("Telefone inválido.")}><MessageCircle className="w-4 h-4 mr-2" />WhatsApp</Button>)}</div></CardContent></Card>
    {selected && <Card><CardHeader><CardTitle className="text-base">{filtered.length} solicitações para {selected.name}</CardTitle></CardHeader><CardContent className="p-0">{filtered.length === 0 ? <div className="text-sm text-muted-foreground px-6 pb-6">Nenhuma solicitação encontrada.</div> : <Table><TableHeader><TableRow><TableHead>Placa</TableHead><TableHead>Nome do Responsável</TableHead><TableHead>Telefone</TableHead><TableHead className="max-w-md">Observações / Particularidades</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader><TableBody>{filtered.map((service) => <TableRow key={service.id}><TableCell className="font-mono text-sm">{service.plateOriginal}</TableCell><TableCell>{service.responsibleOriginal}</TableCell><TableCell className="whitespace-nowrap">{service.phoneOriginal}</TableCell><TableCell className="max-w-md whitespace-pre-wrap text-sm text-muted-foreground">{service.observationsOriginal}</TableCell><TableCell><div className="flex justify-end gap-1"><Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setEditingService(service); setServiceDraft({ plateOriginal: service.plateOriginal, responsibleOriginal: service.responsibleOriginal, phoneOriginal: service.phoneOriginal, observationsOriginal: service.observationsOriginal }); }} aria-label="Editar solicitação"><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => deleteService(service)} aria-label="Excluir solicitação"><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card>}
    <Dialog open={!!editingService} onOpenChange={(open) => !open && setEditingService(null)}><DialogContent><DialogHeader><DialogTitle>Editar solicitação</DialogTitle></DialogHeader><div className="space-y-3"><Input value={serviceDraft.plateOriginal ?? ""} placeholder="Placa" onChange={(e) => setServiceDraft((v) => ({ ...v, plateOriginal: e.target.value }))} /><Input value={serviceDraft.responsibleOriginal ?? ""} placeholder="Nome do responsável" onChange={(e) => setServiceDraft((v) => ({ ...v, responsibleOriginal: e.target.value }))} /><Input value={serviceDraft.phoneOriginal ?? ""} placeholder="Telefone" onChange={(e) => setServiceDraft((v) => ({ ...v, phoneOriginal: e.target.value }))} /><Textarea value={serviceDraft.observationsOriginal ?? ""} placeholder="Observações / Particularidades" onChange={(e) => setServiceDraft((v) => ({ ...v, observationsOriginal: e.target.value }))} /></div><DialogFooter><Button variant="outline" onClick={() => setEditingService(null)}>Cancelar</Button><Button onClick={saveServiceEdit}>Salvar alterações</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
