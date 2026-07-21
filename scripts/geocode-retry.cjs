const https = require("https");

const ADDRESSES = [
  ["bruno", "Avenida Professor Josué de Castro 198, São Gonçalo, RJ"],
  ["christofer", "Rua Júlio Cordeiro 589, Ananindeua, PA"],
  ["danilo", "Rua Vereador Jone Kiss 925, Lauro de Freitas, BA"],
  ["diego gomes rodrigues", "Rua Amazonas 384, Montes Claros, MG"],
  ["diego souza balduino", "Rua Vitalino Machado 125, Araçatuba, SP"],
  ["filipe", "Rua Carbonita 359, Rio de Janeiro, RJ"],
  ["jeilson", "Rua Martins Júnior, Mossoró, RN"],
  ["lourival", "Avenida João Alves Costa 977, Lavras, MG"],
  ["lucas", "Rua Jesus Cristo 9, Serra, ES"],
  ["marcos luiz amorim santos", "Rua Ana Maria Sirani 639, São Paulo, SP"],
  ["odirlei andretti", "Avenida Paraná 827, Francisco Beltrão, PR"],
  ["valnei", "Estrada Costa Rica Alcinópolis Km 3, Costa Rica, MS"],
  ["ricardo m. da rocha", "Alameda Denilson de Paula 69, Uberlândia, MG"],
  ["vinicius araújo", "Rua Caju 1157, Nova Santa Rita, RS"],
];

async function geocode(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(query)}`;
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "creare-geocode/1.0", "Accept-Language": "pt-BR" } }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const arr = JSON.parse(data);
          if (arr[0]) resolve({ lat: parseFloat(arr[0].lat), lng: parseFloat(arr[0].lon) });
          else resolve(null);
        } catch { resolve(null); }
      });
    }).on("error", reject);
  });
}

(async () => {
  for (let i = 0; i < ADDRESSES.length; i++) {
    const [name, query] = ADDRESSES[i];
    process.stdout.write(`[${i + 1}/${ADDRESSES.length}] ${name}... `);
    const coord = await geocode(query + ", Brasil");
    if (coord) {
      console.log(`OK (${coord.lat}, ${coord.lng})`);
    } else {
      console.log("NÃO ENCONTRADO");
    }
    await new Promise((r) => setTimeout(r, 1100));
  }
  console.log("\nConcluído!");
})();
