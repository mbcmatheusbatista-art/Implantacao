const FORMAT_MARKER = "\u200BFORMAT:";
const FORMAT_MARKER_END = "\u200B";

const PASTE_DEBUG = true;

function debugPaste(label: string, data: unknown) {
  if (!PASTE_DEBUG) return;
  console.log(`[PASTE DEBUG] ${label}`, JSON.stringify(data, null, 2));
}

export function parsePastedData(text: string): string[][] {
  if (!text) return [];
  debugPaste("parsePastedData:start", { textLength: text.length, preview: text.slice(0, 1000) });
  const normalizedText = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalizedText.split("\n").filter((l) => l.length > 0);
  if (lines.length === 0) return [];

  // Determine delimiter: prefer tab
  const first = lines[0];
  let delim: string;
  if (first.includes("\t")) delim = "\t";
  else if (first.includes(";")) delim = ";";
  else if (first.includes(",")) delim = ",";
  else delim = "\t";

  const rows: string[][] = [];
  for (const line of lines) {
    if (line.trim() === "") continue;
    rows.push(line.split(delim).map((c) => c.trim()));
  }
  debugPaste("parsePastedData:end", { rowCount: rows.length, rows: rows.slice(0, 10) });
  return rows;
}

type CellFormat = "green" | "red" | "orange";

function marker(format: CellFormat): string {
  return `${FORMAT_MARKER}${format}${FORMAT_MARKER_END}`;
}

function parseClassStyles(doc: Document): Map<string, string> {
  const styles = new Map<string, string>();
  for (const style of Array.from(doc.querySelectorAll("style"))) {
    const css = style.textContent ?? "";
    for (const match of css.matchAll(/(?:^|[\s,])(?:[\w-]+)?\.([\w-]+)\s*\{([^}]+)\}/g)) {
      styles.set(match[1], match[2]);
    }
  }
  return styles;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace("#", "").trim();
  if (clean.length !== 6) return null;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if ([r, g, b].some((value) => Number.isNaN(value))) return null;
  return { r, g, b };
}

function classifyRgb({ r, g, b }: { r: number; g: number; b: number }): CellFormat | null {
  if (r >= 170 && g <= 90 && b <= 90) return "red";
  if (r >= 180 && g >= 80 && g <= 210 && b <= 140) return "orange";
  if (g >= 110 && r <= 130 && b <= 140) return "green";
  return null;
}

function classifyStyle(style: string): CellFormat | null {
  const normalized = style.toLowerCase();
  for (const match of normalized.matchAll(/#[0-9a-f]{6}/g)) {
    const rgb = hexToRgb(match[0]);
    if (!rgb) continue;
    const classified = classifyRgb(rgb);
    if (classified) return classified;
  }
  for (const match of normalized.matchAll(
    /rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)/g,
  )) {
    const classified = classifyRgb({
      r: parseInt(match[1], 10),
      g: parseInt(match[2], 10),
      b: parseInt(match[3], 10),
    });
    if (classified) return classified;
  }
  if (
    normalized.includes("red") ||
    normalized.includes("#ff0000") ||
    normalized.includes("rgb(255, 0, 0)") ||
    normalized.includes("rgb(255,0,0)")
  ) {
    return "red";
  }
  if (
    normalized.includes("orange") ||
    normalized.includes("#ffc000") ||
    normalized.includes("#f4b183") ||
    /rgb\(\s*2[0-5]\d\s*,\s*(1[0-9]\d|2[0-2]\d)\s*,\s*\d{1,2}\s*\)/.test(normalized)
  ) {
    return "orange";
  }
  if (
    normalized.includes("green") ||
    normalized.includes("#00b050") ||
    normalized.includes("#008000") ||
    normalized.includes("rgb(0, 176, 80)") ||
    normalized.includes("rgb(0,176,80)") ||
    normalized.includes("rgb(0, 128, 0)") ||
    normalized.includes("rgb(0,128,0)")
  ) {
    return "green";
  }
  return null;
}

function collectStyle(cell: Element, classStyles: Map<string, string>): string {
  const parts: string[] = [];
  for (const el of [cell, ...Array.from(cell.querySelectorAll("*"))]) {
    parts.push(el.getAttribute("style") ?? "");
    parts.push(el.getAttribute("color") ?? "");
    parts.push(el.getAttribute("bgcolor") ?? "");
    for (const className of Array.from(el.classList)) {
      parts.push(classStyles.get(className) ?? "");
    }
  }
  return parts.filter(Boolean).join(";");
}

export function parsePastedHtmlData(html: string): string[][] {
  if (!html || typeof DOMParser === "undefined") return [];
  debugPaste("html:start", { htmlLength: html.length, htmlPreview: html.slice(0, 1000) });
  const doc = new DOMParser().parseFromString(html, "text/html");
  const classStyles = parseClassStyles(doc);
  const table = doc.querySelector("table");
  if (!table) return [];

  const formattedSamples: unknown[] = [];
  const rows = Array.from(table.querySelectorAll("tr"))
    .map((tr) =>
      Array.from(tr.querySelectorAll("th,td")).map((cell) => {
        const text = (cell.textContent ?? "").replace(/\s+/g, " ").trim();
        const collectedStyle = collectStyle(cell, classStyles);
        const format = classifyStyle(collectedStyle);
        if (format && formattedSamples.length < 20) {
          formattedSamples.push({ text, format, collectedStyle: collectedStyle.slice(0, 500) });
        }
        return format ? `${text}${marker(format)}` : text;
      }),
    )
    .filter((row) =>
      row.some((cell) => cell.replace(/\u200BFORMAT:(green|red|orange)\u200B/g, "").trim()),
    );
  debugPaste("html:end", {
    rowCount: rows.length,
    classStyleCount: classStyles.size,
    formattedSamples,
    rowsPreview: rows.slice(0, 10),
  });
  return rows;
}
