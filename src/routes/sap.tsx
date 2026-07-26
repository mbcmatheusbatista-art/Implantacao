import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ClipboardCopy, Download, MoreVertical, Plus, Save, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { copyShortcutToClipboard, copyTsvToClipboard, matrixToTsv, parseTsv, sapWorkspace, type SapShortcut } from "@/services/sap-workspace";

type SapSearch = { edit?: string; create?: boolean };
export const Route = createFileRoute("/sap")({
  validateSearch: (search: Record<string, unknown>): SapSearch => ({
    edit: typeof search.edit === "string" ? search.edit : undefined,
    create: search.create === true || search.create === "true",
  }),
  component: SapPage,
});

const clipboardError = "Não foi possível copiar automaticamente. Autorize o acesso à área de transferência ou abra o menu de edição para copiar manualmente.";

function SapPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [shortcuts, setShortcuts] = useState<SapShortcut[]>([]);
  const [active, setActive] = useState<SapShortcut | null>(null);
  const [dirty, setDirty] = useState(false);
  const [copiedShortcutId, setCopiedShortcutId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [contextItem, setContextItem] = useState<SapShortcut | null>(null);
  const [contextOpen, setContextOpen] = useState(false);
  const [contextPosition, setContextPosition] = useState({ left: 280, top: 120 });
  const fileRef = useRef<HTMLInputElement>(null);
  const longPress = useRef<number | null>(null);
  const reload = async () => setShortcuts(await sapWorkspace.list());

  useEffect(() => {
    const sync = () => reload().catch((e) => setMessage(e.message));
    sync();
    window.addEventListener("sap-workspace-changed", sync);
    return () => window.removeEventListener("sap-workspace-changed", sync);
  }, []);
  useEffect(() => { if (!contextOpen) return; const close = () => setContextOpen(false); window.addEventListener("click", close); return () => window.removeEventListener("click", close); }, [contextOpen]);
  useEffect(() => {
    if (!active || !dirty) return;
    const timer = window.setTimeout(() => sapWorkspace.saveDraft({ ...active, updatedAt: new Date().toISOString() }), 1500);
    return () => window.clearTimeout(timer);
  }, [active, dirty]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", beforeUnload); return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);
  useEffect(() => {
    if (search.create) create();
    else if (search.edit) sapWorkspace.load(search.edit).then((item) => item && openEditor(item));
  // URL actions are intentionally handled once when changed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.create, search.edit]);

  const openEditor = async (item: SapShortcut) => {
    if (dirty && !window.confirm("Existem alteraÃ§Ãµes nÃ£o salvas. Deseja sair sem salvar?")) return;
    const latest = await sapWorkspace.load(item.id) ?? item;
    const draft = await sapWorkspace.loadDraft(item.id);
    setActive(draft && draft.updatedAt > latest.updatedAt && window.confirm("Foi encontrado um rascunho nÃ£o salvo. Deseja recuperÃ¡-lo?") ? draft : latest);
    setDirty(false); setContextOpen(false); navigate({ to: "/sap" });
  };
  const create = async () => {
    const item = await sapWorkspace.create("Novo orçamento");
    await reload(); setActive(item); setDirty(true); navigate({ to: "/sap" });
  };
  const update = (patch: Partial<SapShortcut>) => { if (!active) return; setActive({ ...active, ...patch }); setDirty(true); };
  const save = async () => {
    if (!active?.name.trim()) return setMessage("Informe um nome para o atalho.");
    const saved = { ...active, name: active.name.trim(), updatedAt: new Date().toISOString() };
    await sapWorkspace.save(saved); await sapWorkspace.clearDraft(saved.id); setActive(saved); setDirty(false); await reload(); setMessage("Atalho salvo no navegador.");
  };
  const copyShortcut = async (item: SapShortcut) => {
    try { await copyShortcutToClipboard(item.id); setCopiedShortcutId(item.id); setMessage("Tabela copiada. Agora vocÃª pode colar no SAP."); }
    catch { setMessage(clipboardError); }
  };
  const paste = async () => {
    try { const text = await navigator.clipboard.readText(); if (!text) return setMessage("Clique na tabela e utilize Ctrl + V para colar os dados."); if (active?.dataMatrix.length && !window.confirm("Substituir toda a tabela atual?")) return; update({ dataMatrix: parseTsv(text) }); }
    catch { setMessage("Clique na tabela e utilize Ctrl + V para colar os dados."); }
  };
  const copyEditor = async () => { if (!active) return; try { await copyTsvToClipboard(matrixToTsv(active.dataMatrix)); setMessage("TSV copiado para a Ã¡rea de transferÃªncia."); } catch { setMessage(clipboardError); } };
  const remove = async (item: SapShortcut) => {
    await sapWorkspace.remove(item.id); if (active?.id === item.id) { setActive(null); setDirty(false); } if (copiedShortcutId === item.id) setCopiedShortcutId(null); await reload(); setContextOpen(false);
  };
  const rename = async (item: SapShortcut) => {
    await openEditor(item);
  };
  const duplicate = async (item: SapShortcut) => {
    const copy = await sapWorkspace.create(`${item.name} - CÃ³pia`);
    await sapWorkspace.save({ ...copy, dataMatrix: item.dataMatrix.map((row) => [...row]), columnWidths: [...item.columnWidths], updatedAt: new Date().toISOString() }); await reload(); setContextOpen(false);
  };
  const download = (name: string, data: string, type: string) => { const url = URL.createObjectURL(new Blob([data], { type })); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url); };
  const showContext = (item: SapShortcut, point?: { x: number; y: number }) => {
    if (point) setContextPosition({ left: Math.max(12, Math.min(point.x + 12, window.innerWidth - 240)), top: Math.max(12, Math.min(point.y + 12, window.innerHeight - 290)) });
    setContextItem(item); setContextOpen(true);
  };
  const columns = useMemo(() => Math.max(1, ...((active?.dataMatrix ?? []).map((row) => row.length))), [active]);
  const addRow = () => update({ dataMatrix: [...(active?.dataMatrix ?? []), Array(columns).fill("")] });
  const removeRow = () => update({ dataMatrix: (active?.dataMatrix ?? []).slice(0, -1) });
  const addColumn = () => update({ dataMatrix: (active?.dataMatrix ?? []).map((row) => [...row, ""]) });
  const removeColumn = () => update({ dataMatrix: (active?.dataMatrix ?? []).map((row) => row.slice(0, -1)) });
  const handlePaste = (event: React.ClipboardEvent) => { const text = event.clipboardData.getData("text/plain"); if (text) { event.preventDefault(); update({ dataMatrix: parseTsv(text) }); } };

  return <div className="space-y-3 max-w-[1400px] mx-auto" onPaste={handlePaste}>
    <div className="flex flex-wrap items-center gap-2 border-b pb-3"><h1 className="text-2xl font-bold mr-2">Orçamento</h1><Button onClick={create}><Plus className="w-4 h-4 mr-1" />Criar atalho</Button><Button variant="outline" onClick={paste}>Colar</Button><Button variant="outline" onClick={copyEditor} disabled={!active}>Copiar tabela</Button><Button variant="outline" onClick={() => active && download(`${active.name}.tsv`, matrixToTsv(active.dataMatrix), "text/tab-separated-values")}>Exportar TSV</Button><Button variant="outline" onClick={async () => download("sap-backup.json", JSON.stringify(await sapWorkspace.exportAll(), null, 2), "application/json")}><Download className="w-4 h-4 mr-1" />Backup</Button><Button variant="outline" onClick={() => fileRef.current?.click()}><Upload className="w-4 h-4 mr-1" />Importar</Button><input ref={fileRef} className="hidden" type="file" accept="application/json" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; try { const data = JSON.parse(await file.text()); if (!Array.isArray(data)) throw new Error(); await sapWorkspace.importAll(data, window.confirm("Substituir os atalhos atuais? Cancelar para mesclar.")); await reload(); setMessage("Backup importado."); } catch { setMessage("Arquivo de backup invÃ¡lido."); } }} /></div>
    <div className="flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>{shortcuts.map((item) => { const copied = copiedShortcutId === item.id; return <div key={item.id} className="flex items-stretch" title={copied ? item.name : "Clique para copiar. Clique com o botÃ£o direito para editar."}><Button size="sm" variant="outline" className={`min-w-40 justify-between rounded-r-none ${copied ? "border-green-600 bg-green-50 text-green-700 hover:bg-green-100" : "hover:border-primary"}`} onClick={() => copyShortcut(item)} onContextMenu={(e) => { e.preventDefault(); showContext(item, { x: e.clientX, y: e.clientY }); }} onKeyDown={(e) => { if ((e.shiftKey && e.key === "F10") || e.key === "ContextMenu") { e.preventDefault(); const rect = e.currentTarget.getBoundingClientRect(); showContext(item, { x: rect.right, y: rect.top }); } }} onTouchStart={(e) => { const touch = e.touches[0]; longPress.current = window.setTimeout(() => showContext(item, touch ? { x: touch.clientX, y: touch.clientY } : undefined), 600); }} onTouchEnd={() => { if (longPress.current) window.clearTimeout(longPress.current); }}><span className="truncate">{copied ? "Copiado" : item.name}</span>{copied ? <Check className="w-4 h-4 ml-2" /> : <ClipboardCopy className="w-4 h-4 ml-2" />}</Button><Button size="sm" variant="outline" aria-label={`Administrar ${item.name}`} className="px-2 rounded-l-none border-l-0" onClick={(e) => { const rect = e.currentTarget.getBoundingClientRect(); showContext(item, { x: rect.right, y: rect.top }); }}><MoreVertical className="w-4 h-4" /></Button></div>; })}</div>
    {contextOpen && contextItem && <div className="fixed z-50 rounded-md border bg-background shadow-lg p-1 min-w-52" style={contextPosition} onClick={(e) => e.stopPropagation()}><Button variant="ghost" className="w-full justify-start" onClick={() => openEditor(contextItem)}>Editar tabela</Button><Button variant="ghost" className="w-full justify-start" onClick={() => rename(contextItem)}>Renomear atalho</Button><Button variant="ghost" className="w-full justify-start" onClick={() => duplicate(contextItem)}>Duplicar atalho</Button><Button variant="ghost" className="w-full justify-start" onClick={() => { download(`${contextItem.name}.tsv`, matrixToTsv(contextItem.dataMatrix), "text/tab-separated-values"); setContextOpen(false); }}>Exportar TSV</Button><Button variant="ghost" className="w-full justify-start" onClick={() => { download(`${contextItem.name}-backup.json`, JSON.stringify(contextItem, null, 2), "application/json"); setContextOpen(false); }}>Exportar backup JSON</Button><Button variant="ghost" className="w-full justify-start text-destructive hover:text-destructive" onClick={() => remove(contextItem)}>Excluir atalho</Button></div>}
    {!active ? <div className="border rounded-md p-8 text-center text-muted-foreground">Crie um atalho SAP para montar uma tabela. Depois de salvo, clique no atalho para copiÃ¡-lo; use o botÃ£o de trÃªs pontos ou o clique direito para editar.</div> : <>
      <div className="flex flex-wrap gap-2 items-center"><Input value={active.name} onChange={(e) => update({ name: e.target.value })} className="max-w-sm" /><Button onClick={save}><Save className="w-4 h-4 mr-1" />Salvar</Button><Button variant="outline" onClick={addRow}>+ Linha</Button><Button variant="outline" onClick={removeRow}>- Linha</Button><Button variant="outline" onClick={addColumn}>+ Coluna</Button><Button variant="outline" onClick={removeColumn}>- Coluna</Button><Button variant="outline" onClick={() => update({ dataMatrix: [] })}>Limpar tabela</Button><Button variant="destructive" onClick={() => remove(active)}><Trash2 className="w-4 h-4 mr-1" />Excluir</Button>{dirty && <span className="text-amber-700 text-sm">Alterações não salvas</span>}<span className="text-xs text-muted-foreground">Atualizado: {new Date(active.updatedAt).toLocaleString("pt-BR")}</span></div>
      {active.dataMatrix.length === 0 ? <div className="border rounded-md p-8 text-center text-muted-foreground">Copie uma tabela no SAP GUI e cole aqui usando Ctrl + V. Linhas, colunas, células vazias e zeros à esquerda são preservados.</div> : <div className="border rounded-md overflow-auto max-h-[65vh]"><table className="text-xs border-collapse min-w-full"><tbody>{active.dataMatrix.map((row, r) => <tr key={r}>{Array.from({ length: columns }, (_, c) => <td key={c} className="border p-0"><input aria-label={`Linha ${r + 1}, coluna ${c + 1}`} className="w-full min-w-28 px-2 py-1 bg-transparent outline-none focus:bg-blue-50" value={row[c] ?? ""} onChange={(e) => { const matrix = active.dataMatrix.map((x) => [...x]); while (matrix[r].length <= c) matrix[r].push(""); matrix[r][c] = e.target.value; update({ dataMatrix: matrix }); }} /></td>)}</tr>)}</tbody></table></div>}
    </>}{message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}<p className="text-xs text-muted-foreground">Os dados SAP são salvos somente neste navegador e dispositivo. Limpar dados do navegador ou usar outro computador poderá removê-los. Utilize Exportar backup regularmente.</p>
  </div>;
}
