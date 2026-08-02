import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, MapPin, Trash2 } from "lucide-react";
import { geocodeFullAddress, reverseGeocodeAddress } from "@/services/distance";
import {
  atualizarTecnicoSupabase,
  criarTecnicoSupabase,
  deletarTecnicoSupabase,
  isSupabaseConfigured,
  listarTecnicosSupabase,
  supabaseTecnicoToTechnician,
} from "@/services/supabase";
import { useAppStore } from "@/stores/app-store";
import type { Technician } from "@/types";
import LocationPicker from "@/components/location-picker";

const UF_LIST = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Quando informado, o dialog entra em modo edição pré-preenchido. */
  editing?: Technician | null;
  onDeleted?: (id: number) => void;
}

interface FormState {
  nome: string;
  telefone: string;
  cnpj: string;
  endereco: string;
  numero: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
}

const INITIAL: FormState = {
  nome: "",
  telefone: "",
  cnpj: "",
  endereco: "",
  numero: "",
  bairro: "",
  cidade: "",
  uf: "",
  cep: "",
};

function buildGeoQuery(
  endereco: string,
  numero: string,
  bairro: string,
  cidade: string,
  uf: string,
  cep: string,
): string {
  const parts: string[] = [];
  const logradouro = numero ? `${endereco}, ${numero}` : endereco;
  parts.push(logradouro);
  if (bairro) parts.push(bairro);
  if (cidade) parts.push(cidade);
  if (uf) parts.push(uf);
  if (cep) parts.push(cep);
  return parts.join(", ").trim();
}

function geocodeQueryVariants(
  endereco: string,
  numero: string,
  bairro: string,
  cidade: string,
  uf: string,
  cep: string,
): string[] {
  const variants: string[] = [];
  const num = numero.trim();
  const logradouro = num ? `${endereco.trim()}, ${num}` : endereco.trim();

  const withBairro = [
    logradouro,
    bairro.trim(),
    cidade.trim(),
    uf.trim(),
    cep.trim(),
  ].filter(Boolean);
  variants.push(withBairro.join(", "));

  const withCidade = [logradouro, cidade.trim(), uf.trim()].filter(Boolean);
  if (withCidade.join(", ") !== withBairro.join(", ")) variants.push(withCidade.join(", "));

  const soLogradouro = [logradouro, cidade.trim()].filter(Boolean);
  if (soLogradouro.join(", ") !== withCidade.join(", ")) variants.push(soLogradouro.join(", "));

  const semLogradouro = [logradouro.replace(num ? `, ${num}` : "", ""), cidade.trim(), uf.trim()].filter(Boolean);
  if (semLogradouro.join(", ") !== soLogradouro.join(", ")) variants.push(semLogradouro.join(", "));

  return [...new Set(variants.filter((v) => v.length > 0))];
}

const UF_MAP = new Set(UF_LIST);

interface ParsedAddress {
  endereco: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
}

// Quebra um endereço completo colado (padrão brasileiro) nos campos do form.
// Ex.: "R. Cleni Vasconcelos de Oliveira, 130 - Pasqualini, Sapucaia do Sul - RS, 93224-473"
export function parseFullAddress(value: string): ParsedAddress {
  const original = value.trim();
  const out: ParsedAddress = { endereco: "" };

  const cepMatch = original.match(/\b(\d{5})-?(\d{3})(?!\d)/);
  if (cepMatch) out.cep = `${cepMatch[1]}-${cepMatch[2]}`;

  let remaining = original.replace(/\b\d{5}-?\d{3}(?!\d)/g, "").trim();
  remaining = remaining.replace(/[\s,;]*$/, "").trim();

  // UF no fim: "... - RS" ou ".../RS"
  const ufMatch = remaining.match(/(\s*-?\s*)([A-Z]{2})\s*$/);
  if (ufMatch) {
    out.uf = ufMatch[2];
    remaining = remaining.slice(0, ufMatch.index).replace(/[,\-\s]+$/, "").trim();
  }

  // Isola o logradouro até o primeiro " - "
  let logradouro = remaining;
  let tail = "";
  const dashIdx = remaining.indexOf(" - ");
  if (dashIdx >= 0) {
    logradouro = remaining.slice(0, dashIdx).trim();
    tail = remaining.slice(dashIdx + 3).trim();
  }

  const numMatch = logradouro.match(/^(.*?),?\s+(\d+)\s*$/);
  if (numMatch) {
    out.endereco = numMatch[1].trim();
    out.numero = numMatch[2];
  } else {
    out.endereco = logradouro;
  }

  // tail = "Bairro, Cidade" ou "Bairro - Cidade"
  const tailParts = tail.split(/\s*-\s*/).map((p) => p.trim()).filter(Boolean);

  // --- Novo padrão: prefixo de empresa/prédio antes da rua exata ---
  // Ex.: "ULBRATECH, Prédio 16 - Av. Farroupilha, 8001 - 2º Andar - São José, Canoas - RS, 92425-900"
  // O logradouro inicial ("núcleo, Prédio 16") é nome de estabelecimento; a
  // rua real é o primeiro trecho do tail (e o "2º Andar" é complemento).
  const buildingPrefix = /(?:[Pp]r[ée]dio|[Bb]loco|[Cc]onjunto|[Ee]dif[ií]cio|[Qq]uadra|[Ss]etor)\b/.test(logradouro);
  if (buildingPrefix && tailParts.length >= 1) {
    out.endereco = "";
    out.numero = undefined;
    const streetPart = tailParts[0];
    const sn = streetPart.match(/^(.*?),?\s+(\d+)\s*$/);
    if (sn) {
      out.endereco = sn[1].trim();
      out.numero = sn[2];
    } else {
      out.endereco = streetPart;
    }
    // Demais trechos: ignora complementos ("2º Andar", "Sala 12"...) e
    // aproveita o "Bairro, Cidade" (padrão já suportado).
    const chiral = tailParts.slice(1).filter((p) => !/(^\d|andar|°|º|sala|t[réè]rreo|conjunto)/i.test(p));
    if (chiral.length === 2 && !out.cidade) {
      out.bairro = chiral[0];
      out.cidade = chiral[1];
    } else if (chiral.length === 1 && !out.cidade) {
      const comma = chiral[0].split(",").map((s) => s.trim()).filter(Boolean);
      if (comma.length >= 2) {
        out.bairro = comma.slice(0, -1).join(", ");
        out.cidade = comma[comma.length - 1];
      } else if (comma.length === 1) {
        out.cidade = comma[0];
      }
    }
    return out;
  }

  if (tailParts.length === 2) {
    out.bairro = tailParts[0];
    out.cidade = tailParts[1];
  } else if (tailParts.length === 1) {
    const comma = tailParts[0].split(",").map((s) => s.trim()).filter(Boolean);
    if (comma.length === 2) {
      out.bairro = comma[0];
      out.cidade = comma[1];
    } else if (comma.length >= 1) {
      const glued = comma[comma.length - 1];
      // Bairro e cidade colados sem vírgula: "CanudosNovo Hamburgo"
      // (minúscula imediatamente seguida de maiúscula + cidade comido)
      const gluedMatch = glued.match(/(^[\wÁÉÍÓÚÂÊÔÃÕÀÇáéíóúâêôãõàç ]*[a-záéíóúãõàç])[A-ZÁÉÍÓÚÃÕÀÇ][a-záéíóúãõ]{2,}/);
      if (comma.length === 1 && gluedMatch) {
        const sepIndex = glued.indexOf(gluedMatch[1]) + gluedMatch[1].length;
        const possiveisCidade = glued.slice(sepIndex).trim();
        if (possiveisCidade.length >= 3 && /[A-Za-z]/.test(possiveisCidade[0]) && /\s/.test(possiveisCidade)) {
          out.bairro = gluedMatch[1].trim();
          out.cidade = possiveisCidade;
        } else {
          out.cidade = comma[comma.length - 1];
          if (comma.length > 1) out.bairro = comma.slice(0, -1).join(", ");
        }
      } else {
        out.cidade = comma[comma.length - 1];
        if (comma.length > 1) out.bairro = comma.slice(0, -1).join(", ");
      }
    }
  } else if (!tail && out.uf) {
    // sem dash: "Rua tal, 100, Cidade - UF"
    const comma = logradouro.split(",").map((s) => s.trim()).filter(Boolean);
    if (comma.length >= 3) {
      out.endereco = comma.slice(0, comma.length - 1).join(", ");
      out.cidade = comma[comma.length - 1];
    }
  }

  return out;
}

export default function TecnicosCadastroDialog({ open, onOpenChange, editing = null, onDeleted }: Props) {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [saving, setSaving] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const reverseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualPinRef = useRef(0);

  const editingId = editing ? (Number(editing.id.replace("supabase_", "")) || null) : null;

  // Quando o dialog abre em modo edição, preenche o form com os dados do técnico.
  useEffect(() => {
    if (!open) return;
    setCoords(null);
    setShowPicker(true);
    if (editing) {
      setForm({
        nome: editing.nameOriginal || "",
        telefone: editing.phoneOriginal || "",
        cnpj: editing.cnpj || "",
        endereco: editing.addressOriginal || "",
        numero: "",
        bairro: "",
        cidade: editing.cityOriginal || "",
        uf: editing.state || "",
        cep: "",
      });
      if (editing.addressLat != null && editing.addressLng != null) {
        setCoords({ lat: editing.addressLat, lng: editing.addressLng });
        setShowPicker(true);
      }
    } else {
      setForm(INITIAL);
    }
  }, [open, editing]);

  function setField<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // Ao colar/editar o campo Endereço, se vier um endereço completo (com número,
  // bairro, cidade, UF e/ou CEP), preenche automaticamente os demais campos.
  function handleEnderecoChange(value: string) {
    const looksComplete =
      /,\s*\d+/.test(value) || /-\s*[A-Z]{2}\s*$/.test(value) || /\d{5}-?\d{3}/.test(value);

    if (looksComplete) {
      const parsed = parseFullAddress(value);
      setForm((prev) => ({
        ...prev,
        endereco: parsed.endereco || prev.endereco,
        numero: parsed.numero ?? prev.numero,
        bairro: parsed.bairro ?? prev.bairro,
        cidade: parsed.cidade ?? prev.cidade,
        uf: parsed.uf ?? prev.uf,
        cep: parsed.cep ?? prev.cep,
      }));
    } else {
      setForm((prev) => ({ ...prev, endereco: value }));
    }
  }

  function reset() {
    setForm(INITIAL);
  }

  // Ao digitar/colar endereço, número, bairro, cidade ou UF, regeocode o ponto
  // para o pino acompanhar a rua + número informados. Manual pin (clique no
  // mapa) tem prioridade por 2 segundos para não ser sobrescrito no meio do
  // ajuste fino.
  useEffect(() => {
    if (!open) return;
    const endereco = form.endereco.trim();
    if (!endereco && !form.cidade && !form.uf) return;
    if (Date.now() - manualPinRef.current < 2500) return;
    const timer = setTimeout(async () => {
      const queries = geocodeQueryVariants(
        form.endereco.trim(),
        form.numero,
        form.bairro,
        form.cidade,
        form.uf,
        form.cep,
      );
      for (const query of queries) {
        const geo = await geocodeFullAddress(query);
        if (geo) {
          setCoords({ lat: geo.lat, lng: geo.lng });
          setShowPicker(true);
          break;
        }
      }
    }, 700);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form.endereco, form.numero, form.bairro, form.cidade, form.uf, form.cep]);

  // Quando o pino é movido no mini-mapa, faz o reverse geocoding para que o
  // endereço textual (que alimenta o tooltip do ícone e a lista de técnicos)
  // reflita exatamente o novo ponto escolhido pelo usuário. O pino acompanha o
  // cursor, então dispara-se dezenas de callbacks por segundo — o reverse é
  // debounced em 600ms para evitar golpes de rate-limit no Nominatim.
  function handleLocationChange(lat: number, lng: number) {
    manualPinRef.current = Date.now();
    setCoords({ lat, lng });
    setShowPicker(true);
    if (reverseTimer.current) clearTimeout(reverseTimer.current);
    reverseTimer.current = setTimeout(async () => {
      const reversed = await reverseGeocodeAddress(lat, lng);
      if (!reversed) return;
      setForm((prev) => ({
        ...prev,
        endereco: reversed.endereco ? reversed.endereco : prev.endereco,
        numero: reversed.numero !== undefined ? reversed.numero : prev.numero,
        bairro: reversed.bairro !== undefined ? reversed.bairro : prev.bairro,
        cidade: reversed.cidade !== undefined ? reversed.cidade : prev.cidade,
        uf: reversed.uf !== undefined ? reversed.uf : prev.uf,
        cep: reversed.cep !== undefined ? reversed.cep : prev.cep,
      }));
    }, 600);
  }

  function upsertTechnicianInStore(technician: Technician) {
    const { technicians } = useAppStore.getState();
    const idx = technicians.findIndex((t) => t.id === technician.id);
    const next =
      idx >= 0
        ? technicians.map((t, i) => (i === idx ? technician : t))
        : [...technicians, technician];
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
  }

  /** Normaliza um nome para comparação: sem acentos, minúsculas, só espaços únicos e sem pontuação. */
  function nameKey(name: string): string {
    return name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR")
      .replace(/[.,;:!?"'()\-]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  async function handleSubmit() {
    const nome = form.nome.trim();
    const endereco = form.endereco.trim();
    if (!nome) {
      toast.error("Informe o nome do técnico.");
      return;
    }
    if (!endereco && !form.cidade && !form.uf) {
      toast.error("Informe pelo menos o endereço (ou cidade/UF) para localizar no mapa.");
      return;
    }

    // Não permitir duplicação: mesmo nome completo (ignorando acentos/caixa), incluindo
    // técnicos do seed/import que ainda não estão no Supabase.
    try {
      const key = nameKey(nome);
      const storeTechs = useAppStore.getState().technicians;
      const localDuplicate = storeTechs.find(
        (t) => t.id !== (editing ? `supabase_${editingId}` : undefined) && nameKey(t.nameOriginal) === key,
      );
      if (localDuplicate) {
        toast.error(`Já existe um técnico com o nome "${localDuplicate.nameOriginal}".`);
        return;
      }
      if (isSupabaseConfigured()) {
        const remote = await listarTecnicosSupabase();
        const remoteDuplicate = remote.find(
          (t) => t.id !== editingId && nameKey(t.nome) === key,
        );
        if (remoteDuplicate) {
          toast.error(`Já existe um técnico com o nome "${remoteDuplicate.nome}".`);
          return;
        }
      }
    } catch (err) {
      console.warn("[TECNICOS] Falha ao verificar duplicidade:", err);
    }

    setSaving(true);
    try {
      // 1. Geocode em tempo real para ter o ponto EXATO desde o cadastro.
      // Tenta variações da query em ordem decrescente de precisão até o
      // geocoder retornar coordenadas (evita o fallback "sem geolocalização").
      let lat = coords?.lat;
      let lng = coords?.lng;
      if ((lat == null || lng == null) && endereco) {
        const queries = geocodeQueryVariants(
          endereco,
          form.numero,
          form.bairro,
          form.cidade,
          form.uf,
          form.cep,
        );
        for (const query of queries) {
          const geo = await geocodeFullAddress(query);
          if (geo) {
            lat = geo.lat;
            lng = geo.lng;
            setCoords({ lat, lng });
            break;
          }
        }
      }

      // 2. Persistir no Supabase com a geolocalização incluída.
      const input = {
        nome,
        telefone: form.telefone.trim(),
        cnpj: form.cnpj.trim(),
        endereco,
        numero: form.numero.trim(),
        bairro: form.bairro.trim(),
        cidade: form.cidade.trim(),
        uf: form.uf.trim(),
        cep: form.cep.trim(),
        latitude: lat ?? null,
        longitude: lng ?? null,
      };
      const saved = editingId
        ? await atualizarTecnicoSupabase(editingId, input)
        : await criarTecnicoSupabase(input);

      // 3. Adicionar/atualizar no estado do app para aparecer no mapa na hora.
      const technician: Technician = supabaseTecnicoToTechnician(saved);
      upsertTechnicianInStore(technician);

      toast.success(
        lat
          ? editingId
            ? "Técnico atualizado e re-localizado no mapa."
            : "Técnico cadastrado e localizado no mapa."
          : editingId
            ? "Técnico atualizado sem geolocalização exata."
            : "Técnico cadastrado sem geolocalização exata.",
      );
      reset();
      onOpenChange(false);
    } catch (err) {
      console.error("[SUPABASE] Erro ao salvar técnico:", err);
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      toast.error(`Falha ao salvar técnico: ${msg}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editingId) return;
    setSaving(true);
    setConfirmDeleteOpen(false);
    try {
      await deletarTecnicoSupabase(editingId);
      // Remove do store para sumir do mapa em todas as máquinas.
      const state = useAppStore.getState();
      const next = state.technicians.filter((t) => t.id !== `supabase_${editingId}`);
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
      onDeleted?.(editingId);
      reset();
      onOpenChange(false);
    } catch (err) {
      console.error("[SUPABASE] Erro ao excluir técnico:", err);
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      toast.error(`Falha ao excluir técnico: ${msg}`);
    } finally {
      setSaving(false);
    }
  }

  const supabaseEnabled = isSupabaseConfigured();
  const enderecoAjustavel = Boolean(
    form.endereco.trim() || form.cidade.trim() || form.uf.trim() || coords,
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-6xl h-[92vh] flex flex-col overflow-hidden p-0 gap-0">
        <div className="px-6 pt-5 pb-3 border-b">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar técnico" : "Cadastrar técnico"}</DialogTitle>
            <DialogDescription>
              {editingId
                ? "Ajuste os dados do técnico — o endereço é re-geocodificado para o ícone permanecer no local exato do mapa."
                : "O endereço é geocodificado na hora do cadastro para que o ícone apareça no local exato do mapa."}
            </DialogDescription>
          </DialogHeader>

          {!supabaseEnabled && (
            <p className="text-xs text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-800 rounded-md p-2 mt-2">
              Supabase não configurado (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). O cadastro
              continuará apenas no navegador.
            </p>
          )}

          <div className="grid gap-2 mt-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="grid gap-1">
                <Label htmlFor="cad-nome">Nome *</Label>
                <Input
                  id="cad-nome"
                  value={form.nome}
                  onChange={(e) => setField("nome", e.target.value)}
                  placeholder="Nome do técnico"
                  className="h-8"
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="cad-telefone">Telefone</Label>
                <Input
                  id="cad-telefone"
                  value={form.telefone}
                  onChange={(e) => setField("telefone", e.target.value)}
                  placeholder="(00) 00000-0000"
                  className="h-8"
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="cad-cnpj">CNPJ (opcional)</Label>
                <Input
                  id="cad-cnpj"
                  value={form.cnpj}
                  onChange={(e) => setField("cnpj", e.target.value)}
                  placeholder="00.000.000/0000-00"
                  className="h-8"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
              <div className="grid gap-1">
                <Label htmlFor="cad-endereco">Endereço *</Label>
                <Input
                  id="cad-endereco"
                  value={form.endereco}
                  onChange={(e) => handleEnderecoChange(e.target.value)}
                  placeholder="Rua/Avenida, logradouro"
                  className="h-8"
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="cad-numero">Número</Label>
                <Input
                  id="cad-numero"
                  value={form.numero}
                  onChange={(e) => setField("numero", e.target.value)}
                  placeholder="Ex.: 1200"
                  className="h-8"
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="cad-bairro">Bairro</Label>
                <Input
                  id="cad-bairro"
                  value={form.bairro}
                  onChange={(e) => setField("bairro", e.target.value)}
                  placeholder="Ex.: Centro"
                  className="h-8"
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="cad-cidade">Cidade</Label>
                <Input
                  id="cad-cidade"
                  value={form.cidade}
                  onChange={(e) => setField("cidade", e.target.value)}
                  placeholder="Ex.: São Paulo"
                  className="h-8"
                />
              </div>
              <div className="grid gap-1">
                <Label>UF</Label>
                <Select value={form.uf} onValueChange={(v) => setField("uf", v)}>
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {UF_LIST.map((uf) => (
                      <SelectItem key={uf} value={uf}>
                        {uf}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label htmlFor="cad-cep">CEP</Label>
                <Input
                  id="cad-cep"
                  value={form.cep}
                  onChange={(e) => setField("cep", e.target.value)}
                  placeholder="00000-000"
                  className="h-8"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col p-4">
          <div className="rounded-md border p-3 flex flex-1 flex-col gap-3 min-h-0">
            <div className="flex items-center justify-between gap-2 shrink-0">
              <div className="text-sm font-medium flex items-center gap-2">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                Localização exata
              </div>
              {coords ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowPicker((v) => !v)}
                  type="button"
                >
                  {showPicker ? "Ocultar mapa" : "Ajustar no mapa"}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowPicker(true)}
                  type="button"
                  disabled={!enderecoAjustavel}
                >
                  Marcar manualmente
                </Button>
              )}
            </div>
            {coords && (
              <div className="text-xs text-muted-foreground shrink-0">
                {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
              </div>
            )}
            {showPicker && coords && (
              <div className="flex-1 min-h-0 relative">
                <LocationPicker
                  lat={coords.lat}
                  lng={coords.lng}
                  onChange={(lat, lng) => {
                    void handleLocationChange(lat, lng);
                  }}
                />
              </div>
            )}
            {showPicker && !coords && (
              <div className="flex-1 min-h-0 relative">
                <LocationPicker
                  lat={-14.235}
                  lng={-51.9253}
                  onChange={(lat, lng) => {
                    void handleLocationChange(lat, lng);
                  }}
                />
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="px-6 py-3 border-t shrink-0">
          {editingId && (
            <Button
              variant="destructive"
              disabled={saving}
              onClick={() => setConfirmDeleteOpen(true)}
              type="button"
              className="mr-auto"
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <Trash2 className="w-4 h-4 mr-2" /> Excluir
            </Button>
          )}
          <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={saving} onClick={() => void handleSubmit()}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {editingId ? "Salvar alterações" : "Cadastrar técnico"}
          </Button>
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen} clickOutsideToClose>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir técnico?</AlertDialogTitle>
            <AlertDialogDescription>
              Confirma a exclusão de "{form.nome.trim() || "sem nome"}"? Esta ação não pode ser
              desfeita e o técnico deixará de aparecer no mapa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={saving}
              onClick={() => void handleDelete()}
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
