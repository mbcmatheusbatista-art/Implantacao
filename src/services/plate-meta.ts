import { saveToDb, loadFromDb } from "@/services/db";

export interface PlateMeta {
  address: string;
  status: string;
}

export type PlateMetaMap = Record<string, PlateMeta>;

export async function savePlateMeta(data: PlateMetaMap): Promise<void> {
  console.log("[PLATE-META SAVE] saving", Object.keys(data).length, "plates:", JSON.stringify(data));
  const existing = await loadFromDb<PlateMetaMap>("plateMeta") ?? {};
  for (const [plate, meta] of Object.entries(data)) {
    existing[plate] = meta;
  }
  await saveToDb("plateMeta", existing);
  const saved = await loadFromDb<PlateMetaMap>("plateMeta");
  console.log("[PLATE-META SAVE] after save, DB has", Object.keys(saved ?? {}).length, "plates");
}

export async function loadPlateMeta(): Promise<PlateMetaMap> {
  const result = await loadFromDb<PlateMetaMap>("plateMeta");
  console.log("[PLATE-META LOAD] loaded plates:", Object.keys(result ?? {}).length, "sample:", JSON.stringify(Object.fromEntries(Object.entries(result ?? {}).slice(0, 3))));
  return result ?? {};
}
