import type { Technician } from "@/types";
import { normalizeText } from "@/utils/normalize-text";

// ---------------------------------------------------------------------------
// Helper: normaliza string para comparação (sem acentos, pontuação, uppercase)
// Ex: "CK - CURITIBA" → "CK CURITIBA", "d.k.c." → "DKC"
// ---------------------------------------------------------------------------
function norm(s: string): string {
  return normalizeText(s);
}

interface SeedEntry {
  firstName: string;
  nameOriginal: string;
  phoneOriginal: string;
  phoneNormalized: string;
  cityOriginal: string;
  state: string;
  quantityOriginal: string;
  address: string;
  lat?: number;
  lng?: number;
}

const SEED_TECHNICIANS_DATA: SeedEntry[] = [
  {
    firstName: "marcos",
    nameOriginal: "Marcos Luiz Amorim Santos",
    phoneOriginal: "11 91484-3217",
    phoneNormalized: "5511914843217",
    cityOriginal: "São Paulo",
    state: "SP",
    quantityOriginal: "10",
    address: "R. Álvaro da Costa, 231 - Jardim Sao Paulo(Zona Leste), São Paulo - SP, 08461-420",
    lat: -23.5583744,
    lng: -46.4021487,
  },
];

/**
 * ENDEREÇOS FIXOS E PERMANENTES dos técnicos.
 * keywords: strings que devem estar contidas no nome normalizado do técnico (sem acentos/pontuação).
 * aliases: nomes alternativos/abreviados como aparecem na planilha.
 * matchState: se definido, o estado do técnico também deve bater.
 * O SEED SEMPRE ganha — nunca é sobrescrito pela planilha.
 */
interface SeedItem {
  /** Stable identity from the supplied location register.  Do not key locations by first name. */
  id?: string;
  firstName: string;
  keywords: string[];   // Qualquer um dessas palavras contido no nome normalizado = match
  matchState?: string;
  address: string;
  lat?: number;
  lng?: number;
}

const SEED: SeedItem[] = [
  {
    id: "heraldo-absolute",
    firstName: "heraldo",
    keywords: ["ABSOLUTE", "HERALDO"],
    address: "Av. Filinto Müller, 1120 - Centro, Três Lagoas - MS, 79600-001",
    lat: -20.7816366, lng: -51.7088525,
  },
  {
    id: "ailana-santos",
    firstName: "ailana",
    keywords: ["AILANA"],
    address: "BR-116, KM 816 - Distrito Industrial, Vitória da Conquista - BA, 45089-340",
    lat: -14.8211298, lng: -40.8109668,
  },
  {
    id: "antonio-sergio-brito",
    firstName: "sergio",
    keywords: ["ANTONIO SERGIO", "ANTONIO SERGIO BRITO"],
    address: "Endereço não localizado com segurança.",
  },
  {
    id: "rafael-auto-system-sc",
    firstName: "rafael",
    keywords: ["AUTO SYSTEM"],
    matchState: "sc",
    address: "R. Antonio Frassetto, 979 - Nossa Sra. de Fátima, Içara - SC, 88820-000",
  },
  {
    id: "rafael-auto-system-ms",
    firstName: "rafael",
    keywords: ["AUTO SYSTEM"],
    matchState: "ms",
    address: "R. Barão de Limeira, 751 - Universitário, Campo Grande - MS, 79060-020",
    lat: -20.5142088, lng: -54.6097534,
  },
  {
    id: "bruno-medeiros",
    firstName: "bruno",
    keywords: ["BRUNO RICARDO", "BRUNO MEDEIROS"],
    address: "Av. Prof. Josué de Castro, 189 - casa 1 - Porto do Rosa, São Gonçalo - RJ, 24425-285",
  },
  {
    firstName: "carlos",
    keywords: ["CARLOS ALBERTO", "CARLOS ALBERTO NASCIMENTO"],
    address: "R. Francisco Braz Prado, 1192 - Parque Bom Retiro, Paulínia - SP, 13140-000",
    lat: -22.7881625, lng: -47.1927215,
  },
  {
    firstName: "christofer",
    keywords: ["CHRISTOFER"],
    address: "R. Júlia Cordeiro, 589 - Águas Brancas, Ananindeua - PA, 67033-210",
    lat: -1.3699299, lng: -48.3739221,
  },
  {
    // CK Curitiba — aparece como "CK - CURITIBA" ou "CK INSTALACAO" na planilha
    firstName: "cleber",
    keywords: ["CK INSTALACAO", "CK CURITIBA", "CK  CURITIBA"],
    matchState: "pr",
    address: "R. Leni Barros Teixeira, 51 - Campo de Santana, Curitiba - PR, 81490-346",
    lat: -25.5954558, lng: -49.3320986,
  },
  {
    // CK Maringá — aparece como "CK - MARINGA" ou "CK MARINGA"
    firstName: "cleber",
    keywords: ["CK MARINGA", "CK  MARINGA"],
    address: "R. Leni Barros Teixeira, 51 - Campo de Santana, Curitiba - PR, 81490-346",
    lat: -25.5954558, lng: -49.3320986,
  },
  {
    firstName: "douglas",
    keywords: ["D C MACHADO", "DC MACHADO", "MACHADO SERVICOS AUTOMOTORES"],
    address: "R. João Rodrigues da Cunha, 920 - Olinda, Nilópolis - RJ, 26515-052",
    lat: -22.8209277, lng: -43.4158981,
  },
  {
    // DKC — aparece como "DKC", "D.K.C.", "D K C INSTALACOES"
    firstName: "diego",
    keywords: ["DKC", "D K C", "DIEGO KURUNZI"],
    address: "Av. Barcelona, 777 - Jardim Panorama, Sarandi - PR, 87113-230",
  },
  {
    firstName: "danilo",
    keywords: ["DANILO DANIEL"],
    address: "R. Felício Nalin, 284 - Jardim Irapua, Piracicaba - SP, 13408-041",
  },
  {
    firstName: "diego",
    keywords: ["DIEGO GOMES RODRIGUES", "DIEGO GOMES"],
    address: "R. Monte Plano, 813 - Cintra, Montes Claros - MG, 39400-713",
  },
  {
    firstName: "diego",
    keywords: ["DIEGO SOUZA BALDUINO", "DIEGO SOUZA"],
    address: "R. Vitalino Machado, 125 - Conj. Hab. Hilda Mandarino, Araçatuba - SP, 16012-510",
    lat: -21.2126483, lng: -50.4065244,
  },
  {
    firstName: "ed",
    keywords: ["ED CARLOS ALVES", "ED CARLOS"],
    address: "R. Frederico Moura, 1664 - Cidade Nova, Franca - SP, 14401-150",
    lat: -20.5278772, lng: -47.3945179,
  },
  {
    firstName: "edvan",
    keywords: ["EDVAN SOARES", "EDVAN"],
    address: "Rua Padre Manuel da Nóbrega, nº 424, Apartamento 101, Bloco 1, Fanny, Curitiba - PR, CEP 81030-330",
    lat: -25.4822762, lng: -49.2731379,
  },
  {
    firstName: "danilo",
    keywords: ["EFRAIM RASTREAMENTO", "EFRAIM"],
    address: "R. Ver. Jone Kiss - Parque Santa Julia, Lauro de Freitas - BA, 42700-000",
  },
  {
    firstName: "filipe",
    keywords: ["FILIPE BARCELOS", "FILIPE BARCELOS DE ALMEIDA"],
    address: "R. Carbonita, 359 - Brás de Pina, Rio de Janeiro - RJ, 21215-210",
    lat: -22.8342064, lng: -43.2926403,
  },
  {
    firstName: "helder",
    keywords: ["HELDER RENATO", "HELDER SOARES"],
    address: "R. João Angelieri, 150, Porto Feliz - SP, 18540-000",
  },
  {
    // J.O. SECCHIN — aparece como "J O SECCHIN", "SECCHIN", "VIX INSTALACOES"
    firstName: "jontahn",
    keywords: ["SECCHIN", "J O SECCHIN", "VIX INSTALACOES", "JONTAHN", "JONATHAN OLIVEIRA"],
    address: "Av. Mauro Miranda Madureira, 562 - Teixeira Leite, Cachoeiro de Itapemirim - ES, 29310-290",
    lat: -20.8257949, lng: -41.1358825,
  },
  {
    firstName: "jeferson",
    keywords: ["JEFERSON FERREIRA", "JEFERSON"],
    address: "R. Igessy Marinho Rocha, 14 - Jacarecica, Maceió - AL, 57038-560",
  },
  {
    firstName: "jeilson",
    keywords: ["JEILSON DE MEDEIROS", "JEILSON"],
    address: "R. Martins Júnior, 501 - Planalto Treze de Maio, Mossoró - RN, 59631-350",
    lat: -5.2181694, lng: -37.3332054,
  },
  {
    firstName: "joão",
    keywords: ["JOAO EVANGELISTA DOS SANTOS JUNIOR", "JOAO EVANGELISTA DOS SANTOS JR", "JOAO EVANGELISTA"],
    address: "R. Nossa Sra. de Lourdes, 940 - João Alves, Nossa Sra. do Socorro - SE, 49155-530",
    lat: -10.8609503, lng: -37.0857419,
  },
  {
    firstName: "joão",
    keywords: ["JOAO VITOR BASSI", "JOAO VITOR"],
    address: "Av. Ernesto Matiolli - Aeroporto, Lavras - MG, 37200-000",
  },
  {
    // JP Rastreadores — aparece como "JACSON PONTELLI (JP Rastreadores)"
    firstName: "jacson",
    keywords: ["JP RASTREADORES", "JACSON PONTELLI"],
    address: "Av. Augusto de Campos, 351 - Jardim das Estacoes (Vila Xavier), Araraquara - SP, 14810-349",
  },
  {
    // Kadosh — aparece como "KADOSH - TEC - SERVICOS..."
    firstName: "adilson",
    keywords: ["KADOSH", "ADILSON AUGUSTO"],
    address: "R. Ruth Mitraud Tofani, 440 - Liberdade, Santa Luzia - MG, 33170-803",
    lat: -19.8626974, lng: -43.8948102,
  },
  {
    firstName: "luis",
    keywords: ["KARLA NEVES", "LUIS ANTONIO CAMPOS"],
    address: "R. Almeida Galhardo - João de Deus, São Luís - MA, 65045-010",
    lat: -2.566844, lng: -44.2618387,
  },
  {
    firstName: "larissa",
    keywords: ["LARISSA GABRIELE", "LARISSA DO AMARAL"],
    address: "Av. Antônio Felipe, 41 - Bairro Alto, Guariba - SP, 14840-000",
  },
  {
    firstName: "leonardo",
    keywords: ["LEONARDO DA SILVA MATOS", "LEONARDO MATOS"],
    address: "Av. Queixadas, 182 - Jardim Camargo Novo, São Paulo - SP, 08121-170",
    lat: -23.5002332, lng: -46.3871458,
  },
  {
    firstName: "lourival",
    keywords: ["LOURIVAL DONIZETI", "LOURIVAL DE PAULA"],
    address: "R. Átila Goulart, 85 - Santa Efigenia, Lavras - MG, 37200-000",
    lat: -21.2608853, lng: -44.9739754,
  },
  {
    firstName: "lucas",
    keywords: ["LUCAS DA SILVEIRA NEVES", "LUCAS SILVEIRA BELIM"],
    address: "R. Jesus Cristo, 09 - Cidade Continental-Setor ASIA, Serra - ES, 29163-645",
  },
  {
    firstName: "marcos",
    keywords: ["MARCOS LUIZ AMORIM", "MARCOS LUIZ"],
    address: "R. Álvaro da Costa, 231 - Jardim Sao Paulo(Zona Leste), São Paulo - SP, 08461-420",
    lat: -23.5583744, lng: -46.4021487,
  },
  {
    firstName: "maurilo",
    keywords: ["MAURILO ROBERTO", "MAURILO CUNHA"],
    address: "Passagem Vista Alegre, 22 - Pedreira, Belém - PA, 66085-740",
    lat: -1.4183762, lng: -48.4685144,
  },
  {
    firstName: "murillo",
    keywords: ["MURILLO AUGUSTO", "MURILLO PEREIRA"],
    address: "Endereço não informado.",
  },
  {
    firstName: "odirlei",
    keywords: ["ODIRLEI ANDRETTI"],
    address: "Av. Paraná, 827 - Vila Nova, Francisco Beltrão - PR, 85605-610",
    lat: -26.0749989, lng: -53.0443794,
  },
  {
    // Olson — aparece como "OLSON SOLUCOES LTDA"
    firstName: "anderson",
    keywords: ["OLSON SOLUCOES", "OLSON", "ANDERSON CARNEIRO", "ANDRE FONSECA"],
    address: "Rua Henrique Bráulio de Melo Sobrinho, Jardim Santa Luzia, São José dos Campos - SP, CEP 12228-850",
    lat: -23.2422009, lng: -45.8357956,
  },
  {
    firstName: "valnei",
    keywords: ["PUK PUK MECANICA", "PUK PUK", "VALNEI"],
    address: "R. 25 Dezembro, 432 - Baús, Costa Rica - MS, 79550-000",
  },
  {
    // R2 Equipadora / C.C.M. Serviços — aparece como "C.C.M. SERVICOS DE RASTREAMENTO - R2"
    firstName: "claudia",
    keywords: ["R2 EQUIPADORA", "CCM SERVICOS", "C C M SERVICOS", "CLAUDIA", "RASTREAMENTO R2"],
    address: "Avenida Recife, nº 3390, Ibura, Recife - PE.",
    lat: -8.1169364, lng: -34.9235171,
  },
  {
    firstName: "reginaldo",
    keywords: ["REGINALDO ALVES BEZERRA", "REGINALDO BEZERRA"],
    address: "R. P-12, Imperatriz - MA, 65913-634",
    lat: -5.5176496, lng: -47.4679024,
  },
  {
    firstName: "reinaldo",
    keywords: ["REINALDO APARECIDO DE OLIVEIRA", "REINALDO OLIVEIRA"],
    address: "Rua do Ouvidor, 438 - Jardim California, Barueri - SP, 06423-090",
    lat: -23.4944966, lng: -46.8704713,
  },
  {
    firstName: "ricardo",
    keywords: ["RICARDO M DA ROCHA", "RICARDO M ROCHA", "RICARDO M  DA ROCHA"],
    address: "Alameda Denilson de Paula, nº 69, Buritis, Uberlândia - MG, CEP 38410-008.",
  },
  {
    firstName: "ricardo",
    keywords: ["SOUZA CRUZ MONITORAMENTO", "SOUZA CRUZ"],
    address: "Rua Dante Senno, 688, Ribeirao Preto - SP, 14.031-420",
  },
  {
    // SS Instalações — aparece como "SS INSTALACOES DE RASTREADORES LTDA"
    firstName: "kléber",
    keywords: ["SS INSTALACOES", "KLEBER", "KLÉBER", "ALAN SS"],
    address: "Av. dos Autonomistas - Km 18, Osasco - SP, 06194-130",
    lat: -23.5258233, lng: -46.8010115,
  },
  {
    firstName: "valdinei",
    keywords: ["VALDINEI LUIZ DE OLIVEIRA", "VALDINEI OLIVEIRA"],
    address: "R. Antônio Bertoncine - Santa Cruz do Rio Pardo, SP, 18900-000",
  },
  {
    firstName: "michael",
    keywords: ["VEMAR AUTO CENTER", "MICHAEL CRESPO"],
    address: "Av. Lourival Martins Beda, 821 - Penha, Campos dos Goytacazes - RJ, 28022-560",
    lat: -21.7921946, lng: -41.2912929,
  },
  {
    firstName: "vinicius",
    keywords: ["VXTECH CONECTA", "VINICIUS ARAUJO", "JAMES VXTECH"],
    address: "R. Caju, 1157, Nova Santa Rita - RS, 92480-000",
    lat: -29.8356793, lng: -51.2607519,
  },
  {
    firstName: "william",
    keywords: ["WILLIAM LUCAS ARAUJO", "WARLLEN TADEU", "MARCO TULIO WILLIAM"],
    address: "R. Nova Serrana, 639 - Nossa Sra. de Lourdes, Pará de Minas - MG, 35660-178",
  },
  {
    firstName: "washiton",
    keywords: ["Z TEC SERVICOS", "Z-TEC", "WASHITON"],
    address: "R. México, 33 - Areinha, Viana - ES, 29137-037",
    lat: -20.3740159, lng: -40.4219893,
  },
];

function isUsableFixedAddress(address: string): boolean {
  const value = norm(address);
  return Boolean(value) && !value.includes("NAO LOCALIZADO") && !value.includes("NAO INFORMADO");
}

/**
 * Matches the complete registered identity/company aliases, never only a first
 * name. This keeps people with the same first name tied to their own address.
 */
export function findFixedTechnicianLocation(technician: Technician): SeedItem | undefined {
  const techNorm = norm(technician.nameOriginal || "");
  const state = (technician.state || "").toLowerCase().trim();
  if (!techNorm) return undefined;

  return SEED.find((seed) => {
    if (seed.matchState && seed.matchState.toLowerCase() !== state) return false;
    return seed.keywords.some((keyword) => {
      const keywordNorm = norm(keyword);
      return techNorm.includes(keywordNorm) || keywordNorm.includes(techNorm);
    });
  });
}

/** Resolves a fixed address from the technician text stored on a service row. */
export function findFixedTechnicianLocationByName(name: string, state = ""): SeedItem | undefined {
  const nameNorm = norm(name);
  const stateNorm = state.toLowerCase().trim();
  if (!nameNorm) return undefined;
  return SEED.find((seed) =>
    (!seed.matchState || seed.matchState.toLowerCase() === stateNorm)
    && seed.keywords.some((keyword) => nameNorm.includes(norm(keyword))),
  );
}

/** Stable identity for a technician in the fixed-location register. */
export function getFixedTechnicianLocationKey(technician: Technician): string | undefined {
  const fixed = findFixedTechnicianLocation(technician);
  if (!fixed) return undefined;
  return fixed.id ?? `seed-${SEED.indexOf(fixed)}`;
}

const BRAZILIAN_UFS = "AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO";

function fixedAddressLocality(address: string): Pick<Technician, "cityOriginal" | "cityNormalized" | "state"> {
  // Use only real Brazilian UFs and retain the final match. A generic
  // two-letter regex incorrectly interpreted “Km 816” as the UF “KM”.
  const matches = Array.from(
    address.matchAll(new RegExp(`(?:-|,)\\s*(${BRAZILIAN_UFS})(?=\\s|,|\\.|$)`, "g")),
  );
  const stateMatch = matches[matches.length - 1];
  const state = stateMatch?.[1] ?? "";
  const beforeState = stateMatch?.index != null ? address.slice(0, stateMatch.index) : address;
  const cityOriginal = beforeState.split(",").pop()?.trim() ?? "";
  return { cityOriginal, cityNormalized: norm(cityOriginal), state };
}

/**
 * Aplica endereços fixos e permanentes da lista fornecida pelo usuário.
 *
 * Matching robusto (normalizado = sem acentos, pontuação, case-insensitive):
 *   - Qualquer keyword da lista `keywords` contida no nome normalizado do técnico = match
 *   - Se matchState definido, o estado também deve bater
 *
 * O SEED SEMPRE GANHA — sobrescreve qualquer endereço vindo da planilha.
 */
export function applySeedAddresses(records: Technician[]): Technician[] {
  console.group("🗺️ [SEED] Aplicando endereços fixos dos técnicos...");
  console.log(`Total de técnicos: ${records.length} | Entradas SEED: ${SEED.length}`);

  const results = records.map((t) => {
    const techNorm = norm(t.nameOriginal || "");
    const matchedSeed = findFixedTechnicianLocation(t);

    if (matchedSeed) {
      const isInvalid = !isUsableFixedAddress(matchedSeed.address);
      const alreadyUsingFixedAddress = t.address === matchedSeed.address;
      const locality = fixedAddressLocality(matchedSeed.address);

      console.log(
        `%c✅ MATCH: "${t.nameOriginal}" → "${matchedSeed.address}"`,
        "color: #16a34a; font-weight: bold;",
      );

      return {
        ...t,
        // SEED sempre ganha, mesmo que a planilha já tenha algum endereço
        // The provided register is authoritative. An explicitly unknown entry
        // must not inherit an imported or client-derived location.
        address: isInvalid ? undefined : matchedSeed.address,
        // The fixed address is also the authoritative city/UF. Imports often
        // omit these columns (as occurred for D C MACHADO), which otherwise
        // prevents the technician from being grouped and routed correctly.
        cityOriginal: isInvalid ? t.cityOriginal : locality.cityOriginal,
        cityNormalized: isInvalid ? t.cityNormalized : locality.cityNormalized,
        state: isInvalid ? t.state : locality.state,
        // Preserve a coordinate only when it was obtained for this same fixed
        // address; never retain coordinates imported for another address.
        addressLat: isInvalid ? undefined : matchedSeed.lat ?? (alreadyUsingFixedAddress ? t.addressLat : undefined),
        addressLng: isInvalid ? undefined : matchedSeed.lng ?? (alreadyUsingFixedAddress ? t.addressLng : undefined),
      };
    }

    console.warn(
      `%c❌ SEM MATCH: "${t.nameOriginal}" (norm: "${techNorm}")`,
      "color: #dc2626;",
    );
    return t;
  });

  const matched = results.filter((r, i) => r.address !== records[i].address || r.addressLat !== records[i].addressLat);
  console.log(`[SEED] Resumo: ${matched.length}/${records.length} técnicos com endereço real aplicado.`);
  console.groupEnd();
  return results;
}

export function getSeedTechnicians(): Technician[] {
  // The location register is itself the base technician list for the map.
  // It must not collapse to the one legacy seed record when no spreadsheet
  // has been imported yet.
  return SEED.map((s, index) => {
    const locality = fixedAddressLocality(s.address);
    const label = s.keywords[0] || s.firstName;
    return {
    id: `fixed_${s.id ?? index}`,
    nameOriginal: label,
    firstName: s.firstName,
    phoneOriginal: "",
    phoneNormalized: null,
    allPhones: [],
    cityOriginal: locality.cityOriginal,
    cityNormalized: locality.cityNormalized,
    state: locality.state,
    quantityOriginal: "0",
    availableQuantity: 0,
    stockStatus: "DISPONIVEL" as const,
    validationIssues: [],
    address: s.address,
    addressLat: s.lat,
    addressLng: s.lng,
  };
  });
}
