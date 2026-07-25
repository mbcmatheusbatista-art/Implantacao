export function normalizeText(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return "";
  return String(input)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanString(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return "";
  return String(input).replace(/\s+/g, " ").trim();
}

export function normalizePlate(input: string | number | null | undefined): string {
  return cleanString(input).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const FORMAT_MARKER_RE = /\u200BFORMAT:\w+\u200B/g;

export function stripFormatMarkers(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return "";
  return String(input).replace(FORMAT_MARKER_RE, "");
}
