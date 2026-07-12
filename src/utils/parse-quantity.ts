import type { TechnicianStockStatus } from "@/types";
import { normalizeText } from "./normalize-text";

const FORMAT_MARKER_RE = /\u200BFORMAT:(green|red|orange)\u200B/;

export function stripQuantityFormat(raw: string): string {
  return raw.replace(FORMAT_MARKER_RE, "").trim();
}

export function parseTechnicianQuantity(raw: string | number | null | undefined): {
  quantity: number | null;
  status: TechnicianStockStatus;
} {
  if (raw === null || raw === undefined || String(raw).trim() === "") {
    return { quantity: null, status: "NAO_INFORMADO" };
  }
  if (typeof raw === "number") {
    if (raw <= 0) return { quantity: 0, status: "SEM_MATERIAL" };
    return { quantity: raw, status: "DISPONIVEL" };
  }
  const textRaw = String(raw);
  const format = textRaw.match(FORMAT_MARKER_RE)?.[1] as "green" | "red" | "orange" | undefined;
  const cleanRaw = stripQuantityFormat(textRaw);
  if (format === "red") return { quantity: 0, status: "SEM_MATERIAL" };
  if (format === "orange") return { quantity: null, status: "CONFIRMAR" };
  const t = normalizeText(cleanRaw);
  if (!t) return { quantity: null, status: "NAO_INFORMADO" };
  if (/NAO\s*POSSUI/.test(t) || t === "0") {
    return { quantity: 0, status: "SEM_MATERIAL" };
  }
  if (/CONFIRMAR/.test(t)) {
    return { quantity: null, status: "CONFIRMAR" };
  }
  const numMatch = cleanRaw.match(/(\d+)/);
  if (numMatch) {
    const n = parseInt(numMatch[1], 10);
    if (n <= 0) return { quantity: 0, status: "SEM_MATERIAL" };
    return { quantity: n, status: "DISPONIVEL" };
  }
  return { quantity: null, status: "TEXTO_NAO_INTERPRETADO" };
}

export function stockStatusLabel(s: TechnicianStockStatus): string {
  switch (s) {
    case "DISPONIVEL":
      return "Disponível";
    case "SEM_MATERIAL":
      return "Sem material";
    case "CONFIRMAR":
      return "Confirmar";
    case "NAO_INFORMADO":
      return "Não informado";
    case "TEXTO_NAO_INTERPRETADO":
      return "Texto não interpretado";
  }
}
