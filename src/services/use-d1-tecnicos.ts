import { useEffect } from "react";
import { useAppStore } from "@/stores/app-store";
import { listarTecnicos } from "@/services/api";
import { applySeedAddresses } from "@/services/seed-data";

/**
 * Builds a d1Map from seed addresses, keyed by first name lowercase.
 * Module-level so it's populated once regardless of component lifecycle.
 */
/**
 * Lista de endereços no formato: [nomeCompleto, primeiroNome, endereco, lat?, lng?]
 * Usamos duas chaves (nome completo e primeiro nome) para maximizar o match.
 */
const SEED_ENTRIES: [string, string, string, number?, number?][] = [
  ["heraldo", "heraldo", "Avenida Filinto Müller, nº 1120, Centro, Três Lagoas - MS, CEP 79600-001", -20.7816366, -51.7088525],
  ["ailana", "ailana", "Rodovia BR-116, Distrito Industrial, Vitória da Conquista - BA, CEP 45089-340", -14.8211298, -40.8109668],
  ["rafael", "rafael", "Rua Barão de Limeira, nº 751, Pioneiros, Campo Grande - MS, CEP 79070-150", -20.5142088, -54.6097534],
  ["bruno", "bruno", "Avenida Professor Josué de Castro, nº 198, Casa 1, Fundos, Porto da Rosa, São Gonçalo - RJ, CEP 24470-000"],
  ["carlos alberto", "carlos", "Rua Francisco Braz do Prado, nº 1192, Bloco 4, Apartamento 11, Parque Bom Retiro, Paulínia - SP, CEP 13142-126", -22.7881625, -47.1927215],
  ["christofer", "christofer", "Rua Júlio Cordeiro, nº 589, Apartamento 201, Bloco 28, Águas Brancas, Ananindeua - PA, CEP 67033-210", -1.3699299, -48.3739221],
  ["cleber", "cleber", "Rua Augusto Bertoldi, nº 35, Campo de Santana, Curitiba - PR, CEP 81490-420", -25.5844903, -49.3354555],
  ["thiago", "thiago", "Rua Augusto Bertoldi, nº 35, Campo de Santana, Curitiba - PR, CEP 81490-420", -25.5844903, -49.3354555],
  ["douglas", "douglas", "Rua João Rodrigues da Cunha, Cabral, Nilópolis - RJ, CEP 26510-049", -22.8209277, -43.4158981],
  ["diego kurunzi", "diego", "Avenida Barcelona, nº 777, Jardim Panorama, Sarandi - PR, CEP 87113-230", -23.4293375, -51.8797487],
  ["danilo daniel", "danilo", "Rua Ricardo Melotto, nº 627, Santa Terezinha, Piracicaba - SP, CEP 13411-068", -22.6772635, -47.6845405],
  ["diego gomes rodrigues", "diego", "Rua Amazonas, nº 384, Roxo Verde, Montes Claros - MG, CEP 39400-534", -16.7318982, -43.8522998],
  ["diego souza balduino", "diego", "Rua Vitalino Machado, nº 125, Conjunto Habitacional Hilda Mandarino, Araçatuba - SP, CEP 16012-510", -21.2126483, -50.4065244],
  ["ed carlos", "ed", "Rua Frederico Moura, nº 1664, Cidade Nova, Franca - SP, CEP 14401-150", -20.5278772, -47.3945179],
  ["edvan", "edvan", "Rua Padre Manuel da Nóbrega, nº 424, Apartamento 101, Bloco 1, Fanny, Curitiba - PR, CEP 81030-330", -25.4822762, -49.2731379],
  ["filipe", "filipe", "Rua Carbonita, nº 359, Apartamento 307, Braz de Pina, Rio de Janeiro - RJ, CEP 21215-210", -22.8342064, -43.2926403],
  ["jontahn oliveira secchin", "jontahn", "Avenida Mauro Miranda Madureira, nº 708, Elpídio Volpini, Cachoeiro de Itapemirim - ES, CEP 29309-712", -20.8257949, -41.1358825],
  ["jeilson", "jeilson", "Rua Martins Júnior, Planalto Treze de Maio, Mossoró - RN, CEP 59631-350", -5.2181694, -37.3332054],
  ["joão evangelista", "joão", "Rua Nossa Senhora de Lourdes, nº 940, Anexo Casa, João Alves, Nossa Senhora do Socorro - SE, CEP 49155-530", -10.8609503, -37.0857419],
  ["joão vitor bassi costa", "joão", "Rua José Gomes Domingues, nº 200, Jaqueline, Belo Horizonte - MG, CEP 31748-075", -19.7980812, -43.9430704],
  ["adilson augusto", "adilson", "Rua Pássaro-Lira, nº 161, Goiânia, Belo Horizonte - MG, CEP 31950-520", -19.8626974, -43.8948102],
  ["luis antonio campos nascimento", "luis", "Rua Projetada 8B, Casa, Vila Conceição, São Luís - MA, CEP 65057-719", -2.566844, -44.2618387],
  ["leonardo", "leonardo", "Avenida Queixadas, nº 13C, Jardim Camargo Novo, São Paulo - SP, CEP 08121-170", -23.5002332, -46.3871458],
  ["lourival", "lourival", "Avenida João Alves Costa, nº 977, Alta Villa Lavras, Lavras - MG, CEP 37205-370", -21.2608853, -44.9739754],
  ["lucas", "lucas", "Rua Jesus Cristo, nº 9, Quadra 04, Setor Ásia, Cidade Continental, Serra - ES, CEP 29163-645"],
  ["marcos luiz amorim santos", "marcos", "Rua Ana Maria Sirani, nº 639, Conjunto Residencial José Bonifácio, São Paulo - SP, CEP 08255-400", -23.550798, -46.4313465],
  ["maurilo", "maurilo", "Passagem Vista Alegre, nº 22, Pedreira, Belém - PA, CEP 66080-510", -1.4183762, -48.4685144],
  ["odirlei andretti", "odirlei", "Avenida Paraná, nº 827, Lote 17, Quadra 68, Presidente Kennedy, Francisco Beltrão - PR, CEP 85605-610", -26.0749989, -53.0443794],
  ["anderson carneiro", "anderson", "Rua Henrique Bráulio de Melo Sobrinho, Jardim Santa Luzia, São José dos Campos - SP, CEP 12228-850", -23.2422009, -45.8357956],
  ["valnei", "valnei", "Estrada Costa Rica/Alcinópolis, Km 03, lado direito, Costa Rica - MS, CEP 79550-000"],
  ["claudia", "claudia", "Avenida Recife, nº 3390, Ibura, Recife - PE", -8.1169364, -34.9235171],
  ["reginaldo alves bezerra", "reginaldo", "Avenida Dorgival Pinheiro de Sousa, nº 334, Vila Lobão, Imperatriz - MA, CEP 65910-010", -5.5176496, -47.4679024],
  ["reinaldo", "reinaldo", "Rua Seikiti Nakayama, nº 300, Jardim Tupanci, Barueri - SP, CEP 06414-005", -23.4944966, -46.8704713],
  ["ricardo m. da rocha", "ricardo", "Alameda Denilson de Paula, nº 69, Buritis, Uberlândia - MG, CEP 38410-008"],
  ["kléber", "kléber", "Avenida dos Autonomistas, nº 5578, Km 18, Osasco - SP, CEP 06194-060", -23.5258233, -46.8010115],
  ["michael crespo", "michael", "Avenida Doutor Newton Guaraná, nº 185, Parque Penha, Campos dos Goytacazes - RJ, CEP 28021-245", -21.7921946, -41.2912929],
  ["vinicius araújo", "vinicius", "R. Caju, 1157, Nova Santa Rita - RS, 92480-000", -29.8356793, -51.2607519],
  ["washiton", "washiton", "Rua México, nº 33, Areinha, Viana - ES, CEP 29137-037", -20.3740159, -40.4219893],
];

function buildSeedMap(): Map<string, { address: string; lat?: number; lng?: number }> {
  const m = new Map<string, { address: string; lat?: number; lng?: number }>();
  for (const [fullName, firstName, addr, lat, lng] of SEED_ENTRIES) {
    const val = { address: addr, lat, lng };
    // Sempre registra pelo nome completo
    m.set(fullName.toLowerCase().trim(), val);
    // Também registra pelo primeiro nome (se não houver conflito)
    if (!m.has(firstName.toLowerCase().trim())) {
      m.set(firstName.toLowerCase().trim(), val);
    }
  }
  return m;
}

let d1LoadAttempted = false;
let d1Map = new Map<string, { endereco: string; latitude: number | null; longitude: number | null }>();
const seedMap = buildSeedMap();

function matchFromSeed(nameOriginal: string, firstName: string): { address: string; lat?: number; lng?: number } | undefined {
  const f = firstName.toLowerCase().trim();
  if (seedMap.has(f)) return seedMap.get(f);

  const n = nameOriginal.toLowerCase().trim();
  for (const [key, val] of seedMap) {
    if (n.includes(key)) return val;
  }

  return undefined;
}

export function useSyncD1Tecnicos() {
  const store = useAppStore();

  function merge() {
    const current = useAppStore.getState().technicians;
    if (current.length === 0) return;

    // The fixed register supplied by the user is authoritative. The old D1
    // fallback list below contains historical addresses that differ from the
    // supplied list and must never overwrite it.
    const authoritative = applySeedAddresses(current);
    const changedByFixedRegister = authoritative.some((technician, index) => {
      const original = current[index];
      return technician.address !== original.address
        || technician.addressLat !== original.addressLat
        || technician.addressLng !== original.addressLng
        || technician.cityOriginal !== original.cityOriginal
        || technician.cityNormalized !== original.cityNormalized
        || technician.state !== original.state;
    });
    if (changedByFixedRegister) {
      const state = useAppStore.getState();
      state.setTechnicians(
        authoritative,
        state.meta?.technicians || { fileName: "", count: authoritative.length },
        state.diagnostics?.technicians || { fileName: "", columnsFound: [], columnsMapped: {}, columnsUnmapped: [], rowsImported: authoritative.length, rowsSkipped: 0, invalidPhones: 0, emptyPlates: 0, emptyNames: 0, emptyAddresses: 0, equipmentUnknown: 0, quantityUnparsed: 0, groupedContacts: 0, nameConflicts: 0, timestamp: Date.now(), headerRow: 0 },
      );
    }
    return;

    const marcosEntries = current.filter((t) => t.firstName.toLowerCase().trim() === "marcos");
    console.log(`[D1] Total técnicos: ${current.length}, Entradas Marcos: ${marcosEntries.length}`);
    for (const m of marcosEntries) {
      console.log(`[D1] Marcos: nameOriginal="${m.nameOriginal}" firstName="${m.firstName}" address="${m.address}" lat=${m.addressLat} lng=${m.addressLng}`);
    }

    let changed = false;
    const enriched = current.map((tech) => {
      const isMarcos = tech.firstName.toLowerCase().trim() === "marcos";
      const oldLat = tech.addressLat;
      const oldLng = tech.addressLng;

      let address = tech.address;
      let addressLat = tech.addressLat;
      let addressLng = tech.addressLng;

      const nameKey = tech.nameOriginal.toLowerCase().trim();
      const d1Entry = d1Map.get(nameKey);

      if (d1Entry && d1Entry.endereco) {
        address = d1Entry.endereco;
        if (d1Entry.latitude != null) addressLat = d1Entry.latitude;
        if (d1Entry.longitude != null) addressLng = d1Entry.longitude;
      } else {
        const seedEntry = matchFromSeed(tech.nameOriginal, tech.firstName);
        if (seedEntry && seedEntry.address) {
          address = seedEntry.address;
          if (seedEntry.lat != null) addressLat = seedEntry.lat;
          if (seedEntry.lng != null) addressLng = seedEntry.lng;
        }
      }

      const latChanged = oldLat !== addressLat;
      const lngChanged = oldLng !== addressLng;

      if (isMarcos) {
        console.log(`[D1] Marcos merge: lat ${oldLat}->${addressLat} (${latChanged ? "mudou" : "igual"}), lng ${oldLng}->${addressLng} (${lngChanged ? "mudou" : "igual"})`);
      }

      if (latChanged || lngChanged || tech.address !== address) {
        changed = true;
        return { ...tech, address, addressLat, addressLng };
      }
      return tech;
    });

    if (changed) {
      const state = useAppStore.getState();
      state.setTechnicians(
        enriched,
        state.meta?.technicians || { fileName: "", count: enriched.length },
        state.diagnostics?.technicians || { fileName: "", columnsFound: [], columnsMapped: {}, columnsUnmapped: [], rowsImported: enriched.length, rowsSkipped: 0, invalidPhones: 0, emptyPlates: 0, emptyNames: 0, emptyAddresses: 0, equipmentUnknown: 0, quantityUnparsed: 0, groupedContacts: 0, nameConflicts: 0, timestamp: Date.now(), headerRow: 0 },
      );
    }
  }

  useEffect(() => {
    if (d1LoadAttempted) return;
    d1LoadAttempted = true;

    listarTecnicos()
      .then((list) => {
        d1Map = new Map(
          list.map((t) => [
            t.nome.toLowerCase().trim(),
            { endereco: t.endereco, latitude: t.latitude, longitude: t.longitude },
          ]),
        );
        merge();
      })
      .catch(() => {
        // D1 unavailable — seed map will be used by merge instead
        merge();
      });
  }, []);

  // Merge whenever technicians change (hydration, import, etc.)
  useEffect(() => {
    merge();
  }, [store.technicians]);
}
