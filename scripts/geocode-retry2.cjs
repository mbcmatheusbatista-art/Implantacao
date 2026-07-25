const https = require("https");

const ADDRESSES = [
  ["bruno", "Professor Josué de Castro 198 São Gonçalo RJ"],
  ["danilo", "Vereador Jone Kiss 925 Lauro de Freitas BA"],
  ["lucas", "Rua Jesus Cristo 9 Cidade Continental Serra ES"],
  ["valnei", "Costa Rica Alcinópolis Km 3 Costa Rica MS"],
  ["ricardo m. da rocha", "Alameda Denilson de Paula 69 Uberlândia MG"],
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
    const coord = await geocode(query);
    if (coord) {
      console.log(`OK (${coord.lat}, ${coord.lng})`);
    } else {
      console.log("NÃO ENCONTRADO");
    }
    await new Promise((r) => setTimeout(r, 1100));
  }
  console.log("\nConcluído!");
})();
