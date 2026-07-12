import type { EquipmentType } from "@/types";
import { normalizeText } from "./normalize-text";

export function normalizeEquipment(raw: string | null | undefined): EquipmentType {
  const t = normalizeText(raw);
  if (!t) return "NAO_IDENTIFICADO";
  const hasS8 = /S8\s*ECO/.test(t) || /S8ECO/.test(t);
  const hasG5Plus =
    /G5\s*PLUS/.test(t) ||
    /G5PLUS/.test(t) ||
    /G5\s*\+/.test(t) ||
    /\bG5\b.*\bID\b/.test(t) ||
    /G5\+/.test(raw ? String(raw).toUpperCase() : "");
  if (hasS8 && hasG5Plus) return "S8_ECO_G5_PLUS";
  if (hasS8) return "S8_ECO";
  return "NAO_IDENTIFICADO";
}

export function equipmentLabel(t: EquipmentType): string {
  switch (t) {
    case "S8_ECO":
      return "S8 ECO";
    case "S8_ECO_G5_PLUS":
      return "S8 ECO + G5 Plus";
    default:
      return "Não identificado";
  }
}
