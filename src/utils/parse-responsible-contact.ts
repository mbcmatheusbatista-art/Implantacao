export type IndicacaoTipo =
  | "esta_com"
  | "falar_com"
  | "fale_com"
  | "contatar"
  | "contato"
  | "procurar"
  | "responsavel_contato"
  | "gestor"
  | "aos_cuidados"
  | "ac";

export interface ResponsibleParsedResult {
  original: string;
  responsavelPrincipal: string;
  pessoaIndicada: string | null;
  tipoIndicacao: IndicacaoTipo | null;
}

export type PersonRole = "primary" | "vehicle_holder" | "manager" | "contact" | "additional";

export interface PersonInfo {
  fullName: string;
  firstName: string;
  role: PersonRole;
  phone: string | null;
  sourceText: string;
}

export interface PeopleParseResult {
  originalText: string;
  people: PersonInfo[];
}

interface PatternDef {
  regex: RegExp;
  type: IndicacaoTipo;
}

const ROLE_MAP: Record<IndicacaoTipo, PersonRole> = {
  esta_com: "vehicle_holder",
  falar_com: "vehicle_holder",
  fale_com: "vehicle_holder",
  contatar: "contact",
  contato: "contact",
  procurar: "vehicle_holder",
  responsavel_contato: "contact",
  gestor: "manager",
  aos_cuidados: "contact",
  ac: "contact",
};

const PATTERNS: PatternDef[] = [
  { regex: /est[áa]\s+com/i, type: "esta_com" },
  { regex: /falar\s+com/i, type: "falar_com" },
  { regex: /fale\s+com/i, type: "fale_com" },
  { regex: /\bcontatar\b/i, type: "contatar" },
  { regex: /\bcontato\b/i, type: "contato" },
  { regex: /\bprocurar\b/i, type: "procurar" },
  { regex: /respons[áa]vel\s+pelo\s+contato/i, type: "responsavel_contato" },
  { regex: /\bgestor[a]?\b/i, type: "gestor" },
  { regex: /aos\s+cuidados\s+de/i, type: "aos_cuidados" },
  { regex: /\ba\/c\b/i, type: "ac" },
];

function cleanName(name: string): string {
  return name
    .replace(/^[,\s/‑\-–—|]+/, "")
    .replace(/[,\s/‑\-–—|]+$/, "")
    .replace(/^(a|o|as|os)\s+/i, "")
    .trim();
}

function findMatchInText(text: string): { match: RegExpExecArray; pattern: PatternDef } | null {
  for (const p of PATTERNS) {
    p.regex.lastIndex = 0;
    const m = p.regex.exec(text);
    if (m) {
      return { match: m, pattern: p };
    }
  }
  return null;
}

function extractIndicated(
  text: string,
  match: RegExpExecArray,
): string | null {
  const afterKeyword = text.slice(match.index + match[0].length).trim();
  const cleaned = cleanName(afterKeyword);
  return cleaned || null;
}

function extractFirstName(fullName: string): string {
  if (!fullName) return "";
  return fullName.split(" ")[0] || fullName;
}

export function parseResponsibleContact(
  input: string | null | undefined,
): ResponsibleParsedResult {
  const original = (input ?? "").trim();
  const result: ResponsibleParsedResult = {
    original,
    responsavelPrincipal: original,
    pessoaIndicada: null,
    tipoIndicacao: null,
  };

  if (!original) return result;

  const parsed = parsePeopleFromResponsibleText(input);
  result.responsavelPrincipal = parsed.people[0]?.fullName || original;
  if (parsed.people.length > 1) {
    const second = parsed.people[1];
    result.pessoaIndicada = second.fullName;
    const roleKey = Object.entries(ROLE_MAP).find(([, v]) => v === second.role)?.[0] as IndicacaoTipo | undefined;
    result.tipoIndicacao = roleKey ?? null;
  }

  return result;
}

export function parsePeopleFromResponsibleText(
  input: string | null | undefined,
): PeopleParseResult {
  const original = (input ?? "").trim();
  const result: PeopleParseResult = { originalText: original, people: [] };

  if (!original) return result;

  const parenGroups: string[] = [];
  let remaining = original;
  const parenRegex = /\(([^)]*)\)/g;
  let parenMatch: RegExpExecArray | null;
  while ((parenMatch = parenRegex.exec(original)) !== null) {
    parenGroups.push(parenMatch[1].trim());
  }

  const beforeParens = original.replace(/\([^)]*\)/g, "").trim();

  if (beforeParens && !findMatchInText(beforeParens)) {
    result.people.push({
      fullName: beforeParens,
      firstName: extractFirstName(beforeParens),
      role: "primary",
      phone: null,
      sourceText: beforeParens,
    });
  } else if (beforeParens) {
    const m = findMatchInText(beforeParens);
    if (m) {
      const primaryName = cleanName(beforeParens.slice(0, m.match.index).trim()) || beforeParens;
      result.people.push({
        fullName: primaryName,
        firstName: extractFirstName(primaryName),
        role: "primary",
        phone: null,
        sourceText: primaryName,
      });
      const indicated = extractIndicated(beforeParens, m.match);
      if (indicated) {
        result.people.push({
          fullName: indicated,
          firstName: extractFirstName(indicated),
          role: ROLE_MAP[m.pattern.type] || "additional",
          phone: null,
          sourceText: m.match[0],
        });
      }
    }
  }

  for (const g of parenGroups) {
    const m = findMatchInText(g);
    if (m) {
      const name = extractIndicated(g, m.match);
      if (name) {
        result.people.push({
          fullName: name,
          firstName: extractFirstName(name),
          role: ROLE_MAP[m.pattern.type] || "additional",
          phone: null,
          sourceText: m.match[0],
        });
      }
    } else if (g) {
      const clean = cleanName(g);
      if (clean && !result.people.some((p) => p.fullName === clean)) {
        result.people.push({
          fullName: clean,
          firstName: extractFirstName(clean),
          role: "additional",
          phone: null,
          sourceText: clean,
        });
      }
    }
  }

  if (result.people.length === 0 && original) {
    result.people.push({
      fullName: original,
      firstName: extractFirstName(original),
      role: "primary",
      phone: null,
      sourceText: original,
    });
  }

  return result;
}

export function normalizePersonName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}
