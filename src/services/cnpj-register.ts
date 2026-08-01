import type { Technician } from "@/types";
import { normalizeText } from "@/utils/normalize-text";

function norm(s: string): string {
  return normalizeText(s);
}

interface CnpjRegisterEntry {
  /** Nome do técnico (pessoa) — exibido no dropdown. */
  techName: string;
  /** Nome/razão social do CNPJ — exibido no título do planner. */
  cnpj: string;
  /** Palavras-chave do nome do técnico como aparecem na planilha. */
  techKeywords: string[];
  /** Palavras-chave do CNPJ/empresa como aparecem na planilha. */
  cnpjKeywords: string[];
}

/**
 * Registro técnico ↔ CNPJ, conforme lista fornecida.
 * A coluna de técnicos da planilha costuma conter o nome do CNPJ (ex:
 * "ABSOLUTE", "CK INSTALACAO", "DKC") enquanto os serviços usam o nome da
 * pessoa. Usado somente na aba "Criação de Planner" — não interfere em
 * roteirização, mapa ou demais abas.
 */
const CNPJ_REGISTER: CnpjRegisterEntry[] = [
  {
    techName: "Heraldo",
    cnpj: "ABSOLUTE SEGURANÇA E TECNOLOGIA LTDA",
    techKeywords: ["HERALDO"],
    cnpjKeywords: ["ABSOLUTE"],
  },
  {
    techName: "Ailana dos Santos Silva",
    cnpj: "23.680.669/0001-77",
    techKeywords: ["AILANA"],
    cnpjKeywords: ["23680669000177"],
  },
  {
    techName: "Antonio Sergio Brito de Jesus",
    cnpj: "Antonio Sergio Brito de Jesus",
    techKeywords: ["ANTONIO SERGIO"],
    cnpjKeywords: ["ANTONIO SERGIO"],
  },
  {
    techName: "Rafael Rogério da Silva",
    cnpj: "AUTO SYSTEM RASTREAMENTO LTDA",
    techKeywords: ["RAFAEL ROGERIO", "RAFAEL"],
    cnpjKeywords: ["AUTO SYSTEM"],
  },
  {
    techName: "Bruno Ricardo Medeiros Soares",
    cnpj: "51.564.374/0001-70",
    techKeywords: ["BRUNO RICARDO", "BRUNO MEDEIROS"],
    cnpjKeywords: ["51564374000170"],
  },
  {
    techName: "Carlos Alberto Nascimento Renno",
    cnpj: "31.686.875/0001-12",
    techKeywords: ["CARLOS ALBERTO"],
    cnpjKeywords: ["31686875000112"],
  },
  {
    techName: "Christofer da Silva Lisboa",
    cnpj: "57.189.493/0001-77",
    techKeywords: ["CHRISTOFER"],
    cnpjKeywords: ["57189493000177"],
  },
  {
    techName: "Cleber",
    cnpj: "CK INSTALAÇÃO E MANUTENÇÃO DE RASTREADORES LTDA",
    techKeywords: ["CLEBER"],
    cnpjKeywords: ["CK INSTALACAO", "CK CURITIBA", "CK MARINGA", "CK"],
  },
  {
    techName: "Thiago",
    cnpj: "CK INSTALAÇÃO E MANUTENÇÃO DE RASTREADORES LTDA",
    techKeywords: ["THIAGO"],
    cnpjKeywords: ["CK INSTALACAO", "CK CURITIBA", "CK MARINGA", "CK"],
  },
  {
    techName: "Douglas Carvalho Machado",
    cnpj: "D C MACHADO SERVIÇOS AUTOMOTORES",
    techKeywords: ["DOUGLAS"],
    cnpjKeywords: ["D C MACHADO", "DC MACHADO", "MACHADO SERVICOS AUTOMOTORES"],
  },
  {
    techName: "Diego Kurunzi",
    cnpj: "D.K.C. INSTALAÇÕES AUTOMOTIVAS LTDA",
    techKeywords: ["DIEGO KURUNZI"],
    cnpjKeywords: ["DKC", "D K C"],
  },
  {
    techName: "Danilo Daniel",
    cnpj: "Danilo Daniel",
    techKeywords: ["DANILO DANIEL"],
    cnpjKeywords: ["DANILO DANIEL"],
  },
  {
    techName: "Diego Gomes Rodrigues",
    cnpj: "Diego Gomes Rodrigues",
    techKeywords: ["DIEGO GOMES"],
    cnpjKeywords: ["DIEGO GOMES"],
  },
  {
    techName: "Diego Souza Balduino",
    cnpj: "Diego Souza Balduino",
    techKeywords: ["DIEGO SOUZA"],
    cnpjKeywords: ["DIEGO SOUZA"],
  },
  {
    techName: "Ed Carlos Alves Rodrigues",
    cnpj: "Ed Carlos Alves Rodrigues",
    techKeywords: ["ED CARLOS"],
    cnpjKeywords: ["ED CARLOS"],
  },
  {
    techName: "Edvan Soares",
    cnpj: "Edvan Soares",
    techKeywords: ["EDVAN"],
    cnpjKeywords: ["EDVAN"],
  },
  {
    techName: "Danilo",
    cnpj: "EFRAIM RASTREAMENTO E GESTÃO DE FROTA LTDA",
    techKeywords: ["DANILO"],
    cnpjKeywords: ["EFRAIM"],
  },
  {
    techName: "Filipe Barcelos de Almeida",
    cnpj: "Filipe Barcelos de Almeida",
    techKeywords: ["FILIPE BARCELOS"],
    cnpjKeywords: ["FILIPE BARCELOS"],
  },
  {
    techName: "Helder Renato Soares",
    cnpj: "Helder Renato Soares",
    techKeywords: ["HELDER RENATO", "HELDER SOARES"],
    cnpjKeywords: ["HELDER RENATO", "HELDER SOARES"],
  },
  {
    techName: "Jonathn Oliveira Secchin",
    cnpj: "J.O. SECCHIN ME, VIX INSTALAÇÕES",
    techKeywords: ["JONTAHN", "JONATHAN OLIVEIRA", "SECCHIN"],
    cnpjKeywords: ["SECCHIN", "J O SECCHIN", "VIX INSTALACOES"],
  },
  {
    techName: "Jeferson Ferreira do Nascimento",
    cnpj: "Jeferson Ferreira do Nascimento",
    techKeywords: ["JEFERSON"],
    cnpjKeywords: ["JEFERSON"],
  },
  {
    techName: "Jeilson de Medeiros Bezerra",
    cnpj: "Jeilson de Medeiros Bezerra",
    techKeywords: ["JEILSON"],
    cnpjKeywords: ["JEILSON"],
  },
  {
    techName: "João Evangelista dos Santos Junior",
    cnpj: "João Evangelista dos Santos Junior",
    techKeywords: ["JOAO EVANGELISTA"],
    cnpjKeywords: ["JOAO EVANGELISTA"],
  },
  {
    techName: "João Vitor Bassi Costa",
    cnpj: "João Vitor Bassi Costa",
    techKeywords: ["JOAO VITOR"],
    cnpjKeywords: ["JOAO VITOR"],
  },
  {
    techName: "Jacson Pontelli",
    cnpj: "JP RASTREADORES",
    techKeywords: ["JACSON PONTELLI", "JACSON"],
    cnpjKeywords: ["JP RASTREADORES"],
  },
  {
    techName: "Adilson Augusto",
    cnpj: "KADOSH-TEC SERVIÇOS DE RASTREAMENTO LTDA",
    techKeywords: ["ADILSON"],
    cnpjKeywords: ["KADOSH"],
  },
  {
    techName: "Luis Antonio Campos Nascimento",
    cnpj: "KARLA NEVES DE SOUSA DO NASCIMENTO",
    techKeywords: ["LUIS ANTONIO CAMPOS", "LUIS ANTONIO"],
    cnpjKeywords: ["KARLA NEVES"],
  },
  {
    techName: "Renan",
    cnpj: "LARISSA GABRIELE DO AMARAL",
    techKeywords: ["RENAN"],
    cnpjKeywords: ["LARISSA GABRIELE", "LARISSA DO AMARAL"],
  },
  {
    techName: "Leonardo da Silva Matos",
    cnpj: "Leonardo da Silva Matos",
    techKeywords: ["LEONARDO"],
    cnpjKeywords: ["LEONARDO"],
  },
  {
    techName: "Lourival Donizeti de Paula",
    cnpj: "Lourival Donizeti de Paula",
    techKeywords: ["LOURIVAL"],
    cnpjKeywords: ["LOURIVAL"],
  },
  {
    techName: "Lucas da Silveira Neves Belim",
    cnpj: "Lucas da Silveira Neves Belim",
    techKeywords: ["LUCAS DA SILVEIRA"],
    cnpjKeywords: ["LUCAS DA SILVEIRA", "LUCAS SILVEIRA BELIM"],
  },
  {
    techName: "Marcos Luiz Amorim Santos",
    cnpj: "Marcos Luiz Amorim Santos",
    techKeywords: ["MARCOS LUIZ"],
    cnpjKeywords: ["MARCOS LUIZ"],
  },
  {
    techName: "Maurilo Roberto Oliveira da Cunha",
    cnpj: "Maurilo Roberto Oliveira da Cunha",
    techKeywords: ["MAURILO"],
    cnpjKeywords: ["MAURILO"],
  },
  {
    techName: "Murillo Augusto Pereira da Silva",
    cnpj: "Murillo Augusto Pereira da Silva",
    techKeywords: ["MURILLO"],
    cnpjKeywords: ["MURILLO"],
  },
  {
    techName: "Odirlei Andretti",
    cnpj: "ODIRLEI ANDRETTI & CIA LTDA",
    techKeywords: ["ODIRLEI"],
    cnpjKeywords: ["ODIRLEI ANDRETTI"],
  },
  {
    techName: "Anderson Carneiro",
    cnpj: "OLSON SOLUÇÕES LTDA",
    techKeywords: ["ANDERSON CARNEIRO", "ANDRE FONSECA"],
    cnpjKeywords: ["OLSON"],
  },
  {
    techName: "Valnei",
    cnpj: "PUK PUK MECÂNICA AUTOMOTIVA LTDA",
    techKeywords: ["VALNEI"],
    cnpjKeywords: ["PUK PUK"],
  },
  {
    techName: "Claudia",
    cnpj: "R2 EQUIPADORA",
    techKeywords: ["CLAUDIA"],
    cnpjKeywords: ["R2 EQUIPADORA", "CCM SERVICOS", "C C M SERVICOS", "RASTREAMENTO R2"],
  },
  {
    techName: "Reginaldo Alves Bezerra",
    cnpj: "Reginaldo Alves Bezerra",
    techKeywords: ["REGINALDO"],
    cnpjKeywords: ["REGINALDO"],
  },
  {
    techName: "Reinaldo Aparecido de Oliveira",
    cnpj: "Reinaldo Aparecido de Oliveira",
    techKeywords: ["REINALDO"],
    cnpjKeywords: ["REINALDO"],
  },
  {
    techName: "Ricardo M. da Rocha",
    cnpj: "RICARDO M. DA ROCHA LTDA",
    techKeywords: ["RICARDO M DA ROCHA", "RICARDO M ROCHA"],
    cnpjKeywords: ["RICARDO M DA ROCHA"],
  },
  {
    techName: "Ricardo Cruz",
    cnpj: "SOUZA CRUZ MONITORAMENTO LTDA",
    techKeywords: ["RICARDO CRUZ"],
    cnpjKeywords: ["SOUZA CRUZ"],
  },
  {
    techName: "Kléber",
    cnpj: "SS INSTALAÇÕES DE RASTREADORES LTDA",
    techKeywords: ["KLEBER", "KLÉBER", "ALAN"],
    cnpjKeywords: ["SS INSTALACOES"],
  },
  {
    techName: "Valdinei Luiz de Oliveira",
    cnpj: "Valdinei Luiz de Oliveira",
    techKeywords: ["VALDINEI"],
    cnpjKeywords: ["VALDINEI"],
  },
  {
    techName: "Michael Crespo",
    cnpj: "VEMAR AUTO CENTER LTDA",
    techKeywords: ["MICHAEL"],
    cnpjKeywords: ["VEMAR"],
  },
  {
    techName: "Vinicius Araújo",
    cnpj: "VXTECH CONECTA LTDA",
    techKeywords: ["VINICIUS ARAUJO", "VINICIUS", "JAMES"],
    cnpjKeywords: ["VXTECH"],
  },
  {
    techName: "Warllen Tadeu",
    cnpj: "WILLIAM LUCAS ARAÚJO SANTOS",
    techKeywords: ["WARLLEN TADEU", "WARLLEN", "MARCO TULIO"],
    cnpjKeywords: ["WILLIAM LUCAS ARAUJO"],
  },
  {
    techName: "Washiton",
    cnpj: "Z-TEC SERVIÇOS DE MANUTENÇÃO DE VEÍCULOS LTDA",
    techKeywords: ["WASHITON"],
    cnpjKeywords: ["Z TEC SERVICOS", "Z TEC"],
  },
];

interface NormalizedEntry {
  entry: CnpjRegisterEntry;
  techNorm: string;
  cnpjNorm: string;
  keywords: string[];
}

const MATCH_INDEX: NormalizedEntry[] = CNPJ_REGISTER.map((entry) => ({
  entry,
  techNorm: norm(entry.techName),
  cnpjNorm: norm(entry.cnpj),
  keywords: [...entry.techKeywords, ...entry.cnpjKeywords].map(norm),
}));

function findEntry(nameNorm: string): CnpjRegisterEntry | undefined {
  if (!nameNorm) return undefined;

  // Igualdade exata ganha de palavras-chave (ex: "DANILO" → EFRAIM,
  // enquanto "DANILO DANIEL" é o registro próprio).
  const exact = MATCH_INDEX.find(
    (item) => item.techNorm === nameNorm || item.cnpjNorm === nameNorm,
  );
  if (exact) return exact.entry;

  return MATCH_INDEX.find((item) =>
    item.keywords.some((keyword) => nameNorm.includes(keyword) || keyword.includes(nameNorm)),
  )?.entry;
}

/** Retorna o registro técnico ↔ CNPJ a partir de qualquer nome como aparece na planilha. */
export function findTechnicianEntryByName(name: string): CnpjRegisterEntry | undefined {
  return findEntry(norm(name || ""));
}

/** Nome do técnico (pessoa) para exibição — cai no nome original se não houver registro. */
export function getTechnicianDisplayName(technician: Technician): string {
  const entry = findTechnicianEntryByName(technician.nameOriginal || "");
  return entry?.techName || technician.nameOriginal;
}

/** CNPJ (razão social) associado ao técnico, para o título do planner. */
export function getTechnicianCnpj(technician: Technician): string | undefined {
  const entry = findTechnicianEntryByName(technician.nameOriginal || "");
  return entry?.cnpj;
}
