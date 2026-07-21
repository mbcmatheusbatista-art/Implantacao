import type { Technician } from "@/types";

const SEED: { firstName: string; address: string; lat?: number; lng?: number }[] = [
  { firstName: "heraldo", address: "Av. Filinto Müller, 1120 - Centro, Três Lagoas - MS, 79600-001", lat: -20.7816366, lng: -51.7088525 },
  { firstName: "ailana", address: "BR-116, KM 816 - Distrito Industrial, Vitória da Conquista - BA, 45089-340", lat: -14.8211298, lng: -40.8109668 },
  { firstName: "rafael", address: "R. Barão de Limeira, 751 - Universitário, Campo Grande - MS, 79060-020", lat: -20.5142088, lng: -54.6097534 },
  { firstName: "bruno", address: "Avenida Professor Josué de Castro, nº 198, Casa 1, Fundos, Porto da Rosa, São Gonçalo - RJ, CEP 24470-000" },
  { firstName: "carlos", address: "R. Francisco Braz Prado, 1192 - Parque Bom Retiro, Paulínia - SP, 13140-000", lat: -22.7881625, lng: -47.1927215 },
  { firstName: "christofer", address: "Rua Júlio Cordeiro, nº 589, Apartamento 201, Bloco 28, Águas Brancas, Ananindeua - PA, CEP 67033-210", lat: -1.3699299, lng: -48.3739221 },
  { firstName: "cleber", address: "R. Leni Barros Teixeira, 51 - Campo de Santana, Curitiba - PR, 81490-346", lat: -25.5954558, lng: -49.3320986 },
  { firstName: "thiago", address: "R. Leni Barros Teixeira, 51 - Campo de Santana, Curitiba - PR, 81490-346", lat: -25.5954558, lng: -49.3320986 },
  { firstName: "douglas", address: "Rua João Rodrigues da Cunha, Cabral, Nilópolis - RJ, CEP 26510-049", lat: -22.8209277, lng: -43.4158981 },
  { firstName: "diego", address: "R. Vitalino Machado, 125 - Conj. Hab. Hilda Mandarino, Araçatuba - SP, 16012-510", lat: -21.2126483, lng: -50.4065244 },
  { firstName: "danilo", address: "Rua Ricardo Melotto, nº 627, Santa Terezinha, Piracicaba - SP, CEP 13411-068", lat: -22.6772635, lng: -47.6845405 },
  { firstName: "ed", address: "R. Frederico Moura, 1664 - Cidade Nova, Franca - SP, 14401-150", lat: -20.5278772, lng: -47.3945179 },
  { firstName: "edvan", address: "Rua Padre Manuel da Nóbrega, nº 424, Apartamento 101, Bloco 1, Fanny, Curitiba - PR, CEP 81030-330", lat: -25.4822762, lng: -49.2731379 },
  { firstName: "filipe", address: "Rua Carbonita, nº 359, Apartamento 307, Braz de Pina, Rio de Janeiro - RJ, CEP 21215-210", lat: -22.8342064, lng: -43.2926403 },
  { firstName: "jontahn", address: "Avenida Mauro Miranda Madureira, nº 708, Elpídio Volpini, Cachoeiro de Itapemirim - ES, CEP 29309-712", lat: -20.8257949, lng: -41.1358825 },
  { firstName: "jeilson", address: "Rua Martins Júnior, Planalto Treze de Maio, Mossoró - RN, CEP 59631-350", lat: -5.2181694, lng: -37.3332054 },
  { firstName: "joão", address: "Rua Nossa Senhora de Lourdes, nº 940, Anexo Casa, João Alves, Nossa Senhora do Socorro - SE, CEP 49155-530", lat: -10.8609503, lng: -37.0857419 },
  { firstName: "adilson", address: "Rua Pássaro-Lira, nº 161, Goiânia, Belo Horizonte - MG, CEP 31950-520", lat: -19.8626974, lng: -43.8948102 },
  { firstName: "luis", address: "Rua Projetada 8B, Casa, Vila Conceição, São Luís - MA, CEP 65057-719", lat: -2.566844, lng: -44.2618387 },
  { firstName: "leonardo", address: "Avenida Queixadas, nº 13C, Jardim Camargo Novo, São Paulo - SP, CEP 08121-170", lat: -23.5002332, lng: -46.3871458 },
  { firstName: "lourival", address: "Avenida João Alves Costa, nº 977, Alta Villa Lavras, Lavras - MG, CEP 37205-370", lat: -21.2608853, lng: -44.9739754 },
  { firstName: "lucas", address: "Rua Jesus Cristo, nº 9, Quadra 04, Setor Ásia, Cidade Continental, Serra - ES, CEP 29163-645" },
  { firstName: "marcos", address: "R. Álvaro da Costa, 231 - Jardim Sao Paulo (Zona Leste), São Paulo - SP, 08461-420", lat: -23.5583744, lng: -46.4021487 },
  { firstName: "maurilo", address: "Passagem Vista Alegre, nº 22, Pedreira, Belém - PA, CEP 66080-510", lat: -1.4183762, lng: -48.4685144 },
  { firstName: "odirlei", address: "Avenida Paraná, nº 827, Lote 17, Quadra 68, Presidente Kennedy, Francisco Beltrão - PR, CEP 85605-610", lat: -26.0749989, lng: -53.0443794 },
  { firstName: "anderson", address: "Rua Henrique Bráulio de Melo Sobrinho, Jardim Santa Luzia, São José dos Campos - SP, CEP 12228-850", lat: -23.2422009, lng: -45.8357956 },
  { firstName: "valnei", address: "Estrada Costa Rica/Alcinópolis, Km 03, lado direito, Costa Rica - MS, CEP 79550-000" },
  { firstName: "claudia", address: "Avenida Recife, nº 3390, Ibura, Recife - PE", lat: -8.1169364, lng: -34.9235171 },
  { firstName: "reginaldo", address: "R. P-12, Imperatriz - MA, 65913-634", lat: -5.5176496, lng: -47.4679024 },
  { firstName: "reinaldo", address: "Rua Seikiti Nakayama, nº 300, Jardim Tupanci, Barueri - SP, CEP 06414-005", lat: -23.4944966, lng: -46.8704713 },
  { firstName: "ricardo", address: "Alameda Denilson de Paula, nº 69, Buritis, Uberlândia - MG, CEP 38410-008" },
  { firstName: "kléber", address: "Avenida dos Autonomistas, nº 5578, Km 18, Osasco - SP, CEP 06194-060", lat: -23.5258233, lng: -46.8010115 },
  { firstName: "michael", address: "Avenida Doutor Newton Guaraná, nº 185, Parque Penha, Campos dos Goytacazes - RJ, CEP 28021-245", lat: -21.7921946, lng: -41.2912929 },
  { firstName: "vinicius", address: "R. Caju, 534, Nova Santa Rita - RS, 92480-000", lat: -29.8356793, lng: -51.2607519 },
  { firstName: "washiton", address: "Rua México, nº 33, Areinha, Viana - ES, CEP 29137-037", lat: -20.3740159, lng: -40.4219893 },
  { firstName: "helber", address: "R. João Angelieri, 150, Porto Feliz - SP, 18540-000" },
  { firstName: "jacson", address: "Av. Augusto de Campos, 351 - Jardim das Estacoes (Vila Xavier), Araraquara - SP, 14810-349" },
  { firstName: "warllen", address: "Pará de Minas - MG" },
];

export const SEED_COORDS = new Map<string, { lat: number; lng: number }>(
  SEED.filter((s) => s.lat != null && s.lng != null).map((s) => [
    s.firstName.toLowerCase(),
    { lat: s.lat!, lng: s.lng! },
  ]),
);

export const SEED_ADDRESSES = new Map<string, string>(
  SEED.map((s) => [s.firstName.toLowerCase(), s.address]),
);

export function applySeedAddresses(records: Technician[]): Technician[] {
  return records.map((t) => {
    const f = t.firstName?.toLowerCase().trim();
    const seed = f ? SEED.find((s) => s.firstName === f) : undefined;
    if (seed) {
      return {
        ...t,
        address: seed.address,
        addressLat: t.addressLat ?? seed.lat,
        addressLng: t.addressLng ?? seed.lng,
      };
    }
    return t;
  });
}
