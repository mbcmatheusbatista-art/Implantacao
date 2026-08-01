import { normalizeText } from "./normalize-text";

export interface EquipmentBreakdown {
  s8EcoSets: number;
  g5PlusSets: number;
  totalKits: number;
  removals: number;
  hasG5Plus: boolean;
  rawDescription: string;
}

export function parseEquipmentQuantity(raw: string | null | undefined): EquipmentBreakdown | null {
  if (!raw) return null;
  const clean = String(raw).replace(/\u200BFORMAT:(green|red|orange)\u200B/g, "").trim();
  const t = normalizeText(clean);
  if (!t) return null;
  if (/NAO\s*POSSUI/.test(t) || /^0$/.test(t)) {
    return { s8EcoSets: 0, g5PlusSets: 0, totalKits: 0, removals: 0, hasG5Plus: false, rawDescription: clean };
  }

  const removals = extractRemovals(clean);
  const mainText = clean.replace(/\([^)]*desinstala[çc][aã]o[^)]*\)/gi, "").trim();
  const normText = normalizeText(mainText);

  if (/CONFIRMAR/.test(t) && !/\d/.test(t)) {
    return { s8EcoSets: 0, g5PlusSets: 0, totalKits: 0, removals, hasG5Plus: false, rawDescription: clean };
  }

  const hasG5Plus = /G5\s*\+/.test(mainText) || /G5PLUS/.test(mainText) || /G5\s*PLUS/.test(mainText);
  const hasS8Eco = /S8\s*ECO/.test(mainText) || /S8ECO/.test(mainText);
  const mainQuantity = extractMainQuantity(mainText);

  if (!hasS8Eco && !hasG5Plus) {
    return { s8EcoSets: mainQuantity, g5PlusSets: 0, totalKits: mainQuantity, removals, hasG5Plus: false, rawDescription: clean };
  }

  if (normText && /ID\s*[=:]?\s*1\s*(CONJUNTO|KIT)?/.test(normText + " ")) {
    return { s8EcoSets: mainQuantity, g5PlusSets: mainQuantity, totalKits: mainQuantity, removals, hasG5Plus: true, rawDescription: clean };
  }

  if (hasS8Eco && hasG5Plus) {
    return { s8EcoSets: mainQuantity, g5PlusSets: mainQuantity, totalKits: mainQuantity, removals, hasG5Plus: true, rawDescription: clean };
  }

  if (hasG5Plus) {
    return { s8EcoSets: 0, g5PlusSets: mainQuantity, totalKits: mainQuantity, removals, hasG5Plus: true, rawDescription: clean };
  }

  return { s8EcoSets: mainQuantity, g5PlusSets: 0, totalKits: mainQuantity, removals, hasG5Plus: false, rawDescription: clean };
}

function extractMainQuantity(text: string): number {
  const match = text.match(/(\d+)\s*(?:CJ|CONJUNTO|KIT|UN|UND|PC|PECA|PEÇA)?/i);
  if (match) return parseInt(match[1], 10);
  const fallback = text.match(/\d+/);
  if (fallback) return parseInt(fallback[0], 10);
  return 0;
}

function extractRemovals(text: string): number {
  const match = text.match(/\((\d+)\s*(?:DESINSTALA[ÇC][AÃ][OØ])/i);
  if (match) return parseInt(match[1], 10);
  const simple = text.match(/(\d+)\s*(?:DESINSTALA[ÇC][AÃ][OØ])/i);
  if (simple) return parseInt(simple[1], 10);
  return 0;
}
