import { writeFileSync } from "fs";

const URL = "https://raw.githubusercontent.com/kelvins/municipios-brasileiros/main/json/municipios.json";

const resp = await fetch(URL);
const all = await resp.json();

const sp = all
  .filter((m) => m.codigo_uf === 35)
  .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

const seen = new Set();

let output = `export const spCityCoords: Record<string, { lat: number; lng: number }> = {\n`;

for (const m of sp) {
  const city = m.nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const key = `${city}, sp`;
  if (seen.has(key)) continue;
  seen.add(key);
  output += `  "${key}": { lat: ${m.latitude}, lng: ${m.longitude} },\n`;
}

output += "};\n";

writeFileSync("src/services/sp-cities.ts", output, "utf-8");
console.log(`Generated ${seen.size} SP cities`);
