import * as XLSX from "xlsx";

export interface WorkbookInfo {
  sheetNames: string[];
  sheets: Record<string, unknown[][]>;
}

export async function parseExcelFile(file: File): Promise<WorkbookInfo> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheets: Record<string, unknown[][]> = {};
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const arr = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      raw: false,
      defval: "",
    });
    sheets[name] = arr;
  }
  return { sheetNames: wb.SheetNames, sheets };
}

export function rowsToObjects(
  rows: unknown[][],
  headerRow: number,
): { headers: string[]; data: Record<string, string>[] } {
  const headers = (rows[headerRow] ?? []).map((h) => String(h ?? "").trim());
  const data: Record<string, string>[] = [];
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const nonEmpty = row.some((c) => String(c ?? "").trim() !== "");
    if (!nonEmpty) continue;
    const obj: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      const key = headers[j] || `Coluna ${j + 1}`;
      obj[key] = String(row[j] ?? "").trim();
    }
    data.push(obj);
  }
  return { headers: headers.map((h, i) => h || `Coluna ${i + 1}`), data };
}
