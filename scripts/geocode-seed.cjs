const https = require("https");

const ADDRESSES = [
  ["heraldo", "Avenida Filinto Müller, 1120, Centro, Três Lagoas, MS"],
  ["ailana", "Rodovia BR-116, Distrito Industrial, Vitória da Conquista, BA"],
  ["rafael", "Rua Barão de Limeira, 751, Pioneiros, Campo Grande, MS"],
  ["bruno", "Avenida Professor Josué de Castro, 198, Porto da Rosa, São Gonçalo, RJ"],
  ["carlos alberto", "Rua Francisco Braz do Prado, 1192, Parque Bom Retiro, Paulínia, SP"],
  ["christofer", "Rua Júlio Cordeiro, 589, Águas Brancas, Ananindeua, PA"],
  ["cleber", "Rua Augusto Bertoldi, 35, Campo de Santana, Curitiba, PR"],
  ["thiago", "Rua Augusto Bertoldi, 35, Campo de Santana, Curitiba, PR"],
  ["douglas", "Rua João Rodrigues da Cunha, Cabral, Nilópolis, RJ"],
  ["diego kurunzi", "Avenida Barcelona, 777, Jardim Panorama, Sarandi, PR"],
  ["danilo daniel", "Rua Ricardo Melotto, 627, Santa Terezinha, Piracicaba, SP"],
  ["danilo", "Rua Vereador Jone Kiss, 925, Itinga, Lauro de Freitas, BA"],
  ["diego gomes rodrigues", "Rua Amazonas, 384, Roxo Verde, Montes Claros, MG"],
  ["diego souza balduino", "Rua Vitalino Machado, 125, Conjunto Habitacional Hilda Mandarino, Araçatuba, SP"],
  ["ed carlos", "Rua Frederico Moura, 1664, Cidade Nova, Franca, SP"],
  ["edvan", "Rua Padre Manuel da Nóbrega, 424, Fanny, Curitiba, PR"],
  ["filipe", "Rua Carbonita, 359, Braz de Pina, Rio de Janeiro, RJ"],
  ["jontahn oliveira secchin", "Avenida Mauro Miranda Madureira, 708, Elpídio Volpini, Cachoeiro de Itapemirim, ES"],
  ["jeilson", "Rua Martins Júnior, Planalto Treze de Maio, Mossoró, RN"],
  ["joão evangelista", "Rua Nossa Senhora de Lourdes, 940, João Alves, Nossa Senhora do Socorro, SE"],
  ["joão vitor bassi costa", "Rua José Gomes Domingues, 200, Jaqueline, Belo Horizonte, MG"],
  ["adilson augusto", "Rua Pássaro-Lira, 161, Goiânia, Belo Horizonte, MG"],
  ["luis antonio campos nascimento", "Rua Projetada 8B, Vila Conceição, São Luís, MA"],
  ["leonardo", "Avenida Queixadas, 13C, Jardim Camargo Novo, São Paulo, SP"],
  ["lourival", "Avenida João Alves Costa, 977, Alta Villa Lavras, Lavras, MG"],
  ["lucas", "Rua Jesus Cristo, 9, Cidade Continental, Serra, ES"],
  ["marcos luiz amorim santos", "Rua Ana Maria Sirani, 639, Conjunto Residencial José Bonifácio, São Paulo, SP"],
  ["maurilo", "Passagem Vista Alegre, 22, Pedreira, Belém, PA"],
  ["odirlei andretti", "Avenida Paraná, 827, Presidente Kennedy, Francisco Beltrão, PR"],
  ["anderson carneiro", "Rua Henrique Bráulio de Melo Sobrinho, Jardim Santa Luzia, São José dos Campos, SP"],
  ["valnei", "Estrada Costa Rica/Alcinópolis, Km 03, Costa Rica, MS"],
  ["claudia", "Avenida Recife, 3390, Ibura, Recife, PE"],
  ["reginaldo alves bezerra", "Avenida Dorgival Pinheiro de Sousa, 334, Vila Lobão, Imperatriz, MA"],
  ["reinaldo", "Rua Seikiti Nakayama, 300, Jardim Tupanci, Barueri, SP"],
  ["ricardo m. da rocha", "Alameda Denilson de Paula, 69, Buritis, Uberlândia, MG"],
  ["kléber", "Avenida dos Autonomistas, 5578, Km 18, Osasco, SP"],
  ["michael crespo", "Avenida Doutor Newton Guaraná, 185, Parque Penha, Campos dos Goytacazes, RJ"],
  ["vinicius araújo", "Rua Caju, 1157, Caju, Nova Santa Rita, RS"],
  ["washiton", "Rua México, 33, Areinha, Viana, ES"],
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
    // Rate limit: 1 request per second
    await new Promise((r) => setTimeout(r, 1100));
  }
  console.log("\nConcluído!");
})();
