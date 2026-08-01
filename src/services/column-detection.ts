import type { FieldKey, ImportKind } from "@/types";
import { normalizeText } from "@/utils/normalize-text";

const SYNONYMS: Record<FieldKey, string[]> = {
  plate: ["PLACA", "PLACAS", "PREFIXO PLACA", "VEICULO", "VEÍCULO"],
  responsible: [
    "NOME DO RESPONSAVEL",
    "NOME DO RESPONSÁVEL",
    "RESPONSAVEL",
    "RESPONSÁVEL",
    "CONTATO",
    "CLIENTE",
    "NOME",
  ],
  phone: [
    "TELEFONE",
    "CELULAR",
    "WHATSAPP",
    "FONE",
    "CEL",
    "TEL",
    "TELEFONES",
    "CELULARES",
    "WHATS",
    "WPP",
    "MOBILE",
    "PHONE",
    "PHONES",
    "CONTATO TELEFONICO",
    "CONTATO TELEFÔNICO",
    "CONTATO TELEFONE",
  ],
  matrix: ["MATRIZ", "EMPRESA", "UNIDADE"],
  address: [
    "ENDERECO COMPLETO PARA ATENDIMENTO",
    "ENDEREÇO COMPLETO PARA ATENDIMENTO",
    "ENDERECO",
    "ENDEREÇO",
    "LOCAL DO ATENDIMENTO",
    "LOCAL DE INSTALACAO",
    "LOCAL DE INSTALAÇÃO",
  ],
  equipment: ["EQUIP", "EQUIPAMENTO", "MATERIAL", "KIT"],
  technician: [
    "TECNICO",
    "TÉCNICO",
    "TECNICO A",
    "TÉCNICO A",
    "TECNICO(A)",
    "NOME DO TECNICO",
    "NOME DO TÉCNICO",
  ],
  city: ["CIDADE", "MUNICIPIO", "MUNICÍPIO", "LOCALIDADE"],
  state: ["UF", "ESTADO"],
  quantity: ["QUANT", "QUANTIDADE", "QTD", "ESTOQUE", "SALDO"],
  status: ["STATUS", "SITUACAO", "SITUAÇÃO", "ESTADO DO SERVICO", "ESTADO DO SERVIÇO"],
  dataHora: ["DATA E HORA", "DATA/HORA", "DATA", "HORARIO", "HORÁRIO"],
  observations: [
    "OBSERVACOES",
    "OBSERVAÇÕES",
    "PARTICULARIDADES",
    "OBSERVACOES/PARTICULARIDADES",
    "OBSERVAÇÕES/PARTICULARIDADES",
    "OBS",
    "OBSERVACAO",
    "OBSERVAÇÃO",
  ],
  chamado: [
    "CHAMADO",
    "CHAMADOS",
    "N. DO CHAMADO",
    "Nº DO CHAMADO",
    "NUMERO DO CHAMADO",
    "NÚMERO DO CHAMADO",
    "Nº CHAMADO",
    "NUM CHAMADO",
    "TICKET",
    "OS",
    "ORDEM DE SERVICO",
    "ORDEM DE SERVIÇO",
  ],
  atendente: [
    "ATEND",
    "ATEND.",
    "ATENDENTE",
    "RESPONSAVEL PELO ATENDIMENTO",
    "RESPONSÁVEL PELO ATENDIMENTO",
    "TECNICO RESPONSAVEL",
    "TÉCNICO RESPONSÁVEL",
    "QUEM ATENDE",
    "QUEM ATENDERÁ",
  ],
  fat: [
    "FAT",
    "FAT.",
    "FATURAMENTO",
    "N. FAT",
    "Nº FAT",
    "NUMERO FAT",
    "NÚMERO FAT",
    "NF FATURAMENTO",
    "NF",
  ],
};

const KIND_FIELDS: Record<ImportKind, FieldKey[]> = {
  initial: ["plate", "responsible", "phone", "matrix"],
  confirmed: [
    "plate",
    "responsible",
    "phone",
    "matrix",
    "address",
    "equipment",
    "technician",
    "status",
    "dataHora",
    "observations",
  ],
  technicians: ["technician", "phone", "city", "state", "quantity", "address"],
  calls: ["chamado", "plate", "equipment", "atendente", "fat"],
};

export function fieldsForKind(kind: ImportKind): FieldKey[] {
  return KIND_FIELDS[kind];
}

export function matchFieldForHeader(header: string): FieldKey | null {
  const n = normalizeText(header);
  if (!n) return null;
  let best: { field: FieldKey; score: number } | null = null;
  for (const [field, syns] of Object.entries(SYNONYMS) as [FieldKey, string[]][]) {
    for (const s of syns) {
      const ns = normalizeText(s);
      if (n === ns) return field;
      if (n.includes(ns) || ns.includes(n)) {
        const score = Math.min(n.length, ns.length);
        if (!best || score > best.score) best = { field, score };
      }
    }
  }
  return best?.field ?? null;
}

/**
 * Given a matrix of raw rows, detect which row is the header by counting recognized field matches.
 */
export function detectHeaderRow(rows: unknown[][], kind: ImportKind): number {
  const wanted = new Set(fieldsForKind(kind));
  let bestIdx = 0;
  let bestScore = -1;
  const maxCheck = Math.min(rows.length, 15);
  for (let i = 0; i < maxCheck; i++) {
    const row = rows[i];
    if (!row) continue;
    const matched = new Set<FieldKey>();
    for (const cell of row) {
      const f = matchFieldForHeader(String(cell ?? ""));
      if (f && wanted.has(f)) matched.add(f);
    }
    if (matched.size > bestScore) {
      bestScore = matched.size;
      bestIdx = i;
    }
  }
  return bestIdx;
}

export function autoMapColumns(headers: string[]): Partial<Record<FieldKey, string>> {
  const map: Partial<Record<FieldKey, string>> = {};
  for (const h of headers) {
    const f = matchFieldForHeader(h);
    if (f && !map[f]) map[f] = h;
  }
  return map;
}
