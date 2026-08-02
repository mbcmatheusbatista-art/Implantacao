import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Technician } from "@/types";
import { normalizeText } from "@/utils/normalize-text";

let cachedClient: SupabaseClient | null = null;

function envValue(key: string): string {
  const value = (import.meta.env as Record<string, string | undefined>)?.[key];
  return (value || "").trim();
}

function envUrl(): string {
  return envValue("VITE_SUPABASE_URL");
}

function envAnonKey(): string {
  return envValue("VITE_SUPABASE_ANON_KEY");
}

export function isSupabaseConfigured(): boolean {
  return Boolean(envUrl() && envAnonKey());
}

export function getSupabase(): SupabaseClient | null {
  const url = envUrl();
  const anonKey = envAnonKey();
  if (!url || !anonKey) return null;
  if (!cachedClient) {
    cachedClient = createClient(url, anonKey);
  }
  return cachedClient;
}

export interface SupabaseTecnico {
  id: number;
  nome: string;
  telefone: string;
  cnpj: string;
  endereco: string;
  numero: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  latitude: number | null;
  longitude: number | null;
  equipamentos: string;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateSupabaseTecnicoInput {
  nome: string;
  telefone?: string;
  cnpj?: string;
  endereco?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
  latitude?: number | null;
  longitude?: number | null;
  equipamentos?: string;
}

function parseRow(row: unknown): SupabaseTecnico {
  const r = row as Record<string, unknown>;
  return {
    id: Number(r.id ?? 0),
    nome: String(r.nome ?? ""),
    telefone: String(r.telefone ?? ""),
    cnpj: String(r.cnpj ?? ""),
    endereco: String(r.endereco ?? ""),
    numero: String(r.numero ?? ""),
    bairro: String(r.bairro ?? ""),
    cidade: String(r.cidade ?? ""),
    uf: String(r.uf ?? ""),
    cep: String(r.cep ?? ""),
    latitude: typeof r.latitude === "number" && Number.isFinite(r.latitude) ? r.latitude : null,
    longitude: typeof r.longitude === "number" && Number.isFinite(r.longitude) ? r.longitude : null,
    equipamentos: String(r.equipamentos ?? ""),
    ativo: r.ativo !== false,
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
  };
}

async function fetchTecnicos(): Promise<SupabaseTecnico[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase.from("tecnicos").select("*").order("id");
  if (error) throw new Error(error.message);
  return data.map((row) => parseRow(row));
}

export async function listarTecnicosSupabase(): Promise<SupabaseTecnico[]> {
  try {
    return await fetchTecnicos();
  } catch (err) {
    console.warn("[SUPABASE] Erro ao listar técnicos:", err);
    return [];
  }
}

export async function criarTecnicoSupabase(
  input: CreateSupabaseTecnicoInput,
): Promise<SupabaseTecnico> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase não configurado");
  const payload = {
    nome: input.nome,
    telefone: input.telefone ?? "",
    cnpj: input.cnpj ?? "",
    endereco: input.endereco ?? "",
    numero: input.numero ?? "",
    bairro: input.bairro ?? "",
    cidade: input.cidade ?? "",
    uf: input.uf ?? "",
    cep: input.cep ?? "",
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    equipamentos: input.equipamentos ?? "",
  };
  const { data, error } = await supabase.from("tecnicos").upsert(payload).select().maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Nenhum técnico retornado após o cadastro");
  return parseRow(data);
}

export async function atualizarTecnicoSupabase(
  id: number,
  input: CreateSupabaseTecnicoInput,
): Promise<SupabaseTecnico> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase não configurado");
  const payload = {
    nome: input.nome,
    telefone: input.telefone ?? "",
    cnpj: input.cnpj ?? "",
    endereco: input.endereco ?? "",
    numero: input.numero ?? "",
    bairro: input.bairro ?? "",
    cidade: input.cidade ?? "",
    uf: input.uf ?? "",
    cep: input.cep ?? "",
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    equipamentos: input.equipamentos ?? "",
  };
  const { data, error } = await supabase
    .from("tecnicos")
    .update(payload)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Nenhum técnico retornado após a atualização");
  return parseRow(data);
}

export async function deletarTecnicoSupabase(id: number): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase não configurado");
  const { error } = await supabase.from("tecnicos").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function obterTecnicoSupabase(id: number): Promise<SupabaseTecnico | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("tecnicos")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? parseRow(data) : null;
}

/** Converte uma linha do Supabase em um Technician do app (mesmo formato do seed). */
export function supabaseTecnicoToTechnician(row: SupabaseTecnico): Technician {
  const cityOriginal = row.cidade || "";
  return {
    id: `supabase_${row.id}`,
    nameOriginal: row.nome,
    firstName: row.nome.split(" ")[0] || row.nome,
    phoneOriginal: row.telefone || "",
    phoneNormalized: sanitizePhone(row.telefone) ?? "",
    allPhones: row.telefone ? [sanitizePhone(row.telefone) ?? ""].filter(Boolean) : [],
    cityOriginal,
    cityNormalized: normalizeText(cityOriginal),
    state: row.uf || "",
    quantityOriginal: "0",
    availableQuantity: 0,
    stockStatus: "DISPONIVEL" as const,
    validationIssues: [],
    address: buildFullAddress(row),
    addressLat: row.latitude ?? undefined,
    addressLng: row.longitude ?? undefined,
    cnpj: row.cnpj || undefined,
    addressOriginal: row.endereco,
  };
}

/**
 * Junta todos os campos do endereço em uma linha legível, exatamente como o
 * seed formata os endereços fixos — importante para o mapa/busca.
 */
export function buildFullAddress(
  row: Pick<SupabaseTecnico, "endereco" | "numero" | "bairro" | "cidade" | "uf" | "cep">,
): string {
  const parts: string[] = [];
  if (row.endereco) {
    parts.push(row.numero ? `${row.endereco}, ${row.numero}` : row.endereco);
  }
  if (row.bairro) parts.push(row.bairro);
  const cityState = [row.cidade, row.uf].filter(Boolean).join(" - ");
  if (cityState) parts.push(cityState);
  if (row.cep) parts.push(`CEP ${row.cep}`);
  return parts.join(", ");
}

function sanitizePhone(phone: string): string | null {
  const digits = (phone || "").replace(/\D/g, "");
  if (!digits) return null;
  const hasCountry = digits.length >= 12;
  return hasCountry ? digits : `55${digits}`;
}
