export interface D1Tecnico {
  id: number;
  nome: string;
  telefone: string;
  endereco: string;
  numero: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  latitude: number | null;
  longitude: number | null;
  equipamentos: string;
  ativo: number;
  created_at: string;
  updated_at: string;
}

export interface ApiError {
  error: string;
}

export interface ImportResult {
  inseridos: number;
  atualizados: number;
  ignorados: number;
  erros: string[];
}

const BASE = "";

function apiUrl(path: string): string {
  return `${BASE}${path}`;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg: string;
    try {
      const body = (await res.json()) as ApiError;
      msg = body.error ?? `HTTP ${res.status}`;
    } catch {
      msg = `HTTP ${res.status}`;
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export async function listarTecnicos(): Promise<D1Tecnico[]> {
  const res = await fetch(apiUrl("/api/tecnicos"));
  const data = await handleResponse<{ tecnicos: D1Tecnico[] }>(res);
  return data.tecnicos;
}

export interface CreateTecnicoInput {
  nome: string;
  telefone?: string;
  endereco?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
  latitude?: number;
  longitude?: number;
  equipamentos?: string;
}

export async function criarTecnico(input: CreateTecnicoInput): Promise<D1Tecnico> {
  const res = await fetch(apiUrl("/api/tecnicos"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await handleResponse<{ tecnico: D1Tecnico }>(res);
  return data.tecnico;
}

export interface UpdateTecnicoInput {
  nome?: string;
  telefone?: string;
  endereco?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
  latitude?: number;
  longitude?: number;
  equipamentos?: string;
  ativo?: number;
}

export async function atualizarTecnico(id: number, input: UpdateTecnicoInput): Promise<D1Tecnico> {
  const res = await fetch(apiUrl(`/api/tecnicos/${id}`), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await handleResponse<{ tecnico: D1Tecnico }>(res);
  return data.tecnico;
}

export async function excluirTecnico(id: number): Promise<void> {
  const res = await fetch(apiUrl(`/api/tecnicos/${id}`), {
    method: "DELETE",
  });
  await handleResponse<{ success: boolean }>(res);
}

export async function importarTecnicosEmLote(
  tecnicos: CreateTecnicoInput[],
): Promise<ImportResult> {
  const res = await fetch(apiUrl("/api/tecnicos/import"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(tecnicos),
  });
  if (!res.ok) {
    return { inseridos: 0, atualizados: 0, ignorados: 0, erros: [`HTTP ${res.status}: ${await res.text()}`] };
  }
  return res.json() as Promise<ImportResult>;
}
