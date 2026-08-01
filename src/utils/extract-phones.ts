import { extractPhoneCandidates, normalizeBrazilianPhone } from "./normalize-phone";

export interface PeoplePhoneAssociation {
  primaryPerson: { phone: string | null; original: string };
  indicatedPerson: { phone: string | null; original: string } | null;
  additionalPhones: string[];
  allValidPhones: string[];
}

export function extractPhoneNumbers(raw: string): string[] {
  if (!raw) return [];
  const candidates = extractPhoneCandidates(raw);

  const result: string[] = [];
  const seen = new Set<string>();

  for (const c of candidates) {
    if (seen.has(c)) continue;
    seen.add(c);
    const normalized = normalizeBrazilianPhone(c);
    if (normalized.status === "valid" && normalized.primary) {
      if (!result.includes(normalized.primary)) {
        result.push(normalized.primary);
      }
    }
  }

  return result;
}

export function associatePeopleAndPhones(
  phoneRaw: string,
  hasIndicatedPerson: boolean,
): PeoplePhoneAssociation {
  const phones = extractPhoneNumbers(phoneRaw);

  const result: PeoplePhoneAssociation = {
    primaryPerson: { phone: phones[0] ?? null, original: phoneRaw },
    indicatedPerson: null,
    additionalPhones: [],
    allValidPhones: [...phones],
  };

  if (!hasIndicatedPerson) {
    if (phones.length > 1) {
      result.additionalPhones = phones.slice(1);
    }
    return result;
  }

  if (phones.length >= 2) {
    result.primaryPerson.phone = phones[0];
    result.indicatedPerson = { phone: phones[1], original: phoneRaw };
    if (phones.length > 2) {
      result.additionalPhones = phones.slice(2);
    }
  } else if (phones.length === 1) {
    result.primaryPerson.phone = phones[0];
  }

  return result;
}

const MANAGER_KEYWORDS = /\b(gestor|gestora)\b/i;
const VEHICLE_HOLDER_KEYWORDS = /\b(est[áa]\s+com|falar\s+com|fale\s+com|ve[ií]culo\s+com|carro\s+com|procurar|a\/c)\b/i;
const CONTACT_KEYWORDS = /\b(contatar|contato|aos\s+cuidados\s+de)\b/i;
const ALL_KEYWORDS = /(gestor|gestora|est[áa]\s+com|falar\s+com|fale\s+com|ve[ií]culo\s+com|carro\s+com|procurar|a\/c\b|contatar|contato|aos\s+cuidados\s+de)/i;

export interface PhoneWithContext {
  phone: string | null;
  raw: string;
  contextKeyword: string | null;
}

export function extractPhonesWithContext(raw: string): PhoneWithContext[] {
  if (!raw) return [];
  const candidates = extractPhoneCandidates(raw);

  const result: PhoneWithContext[] = [];
  const seen = new Set<string>();

  for (const c of candidates) {
    if (seen.has(c)) continue;
    seen.add(c);
    const normalized = normalizeBrazilianPhone(c);
    if (normalized.status === "valid" && normalized.primary) {
      if (result.some((r) => r.phone === normalized.primary)) continue;

      const idx = raw.indexOf(c);
      const beforeText = idx > 0 ? raw.slice(Math.max(0, idx - 20), idx) : "";
      const keywordMatch = beforeText.match(ALL_KEYWORDS);
      result.push({
        phone: normalized.primary,
        raw: c,
        contextKeyword: keywordMatch ? keywordMatch[1] : null,
      });
    }
  }

  return result;
}

export function associatePhonesToPeople(
  phoneRaw: string,
  peopleCount: number,
  managerIndex: number,
  vehicleHolderIndices: number[],
): { phone: string | null; role: string }[] {
  const phones = extractPhonesWithContext(phoneRaw);
  if (phones.length === 0) {
    return Array.from({ length: peopleCount }, () => ({ phone: null, role: "unknown" }));
  }

  const result: { phone: string | null; role: string }[] = Array.from({ length: peopleCount }, () => ({
    phone: null,
    role: "unknown",
  }));

  const used = new Set<number>();

  for (let i = 0; i < phones.length; i++) {
    const p = phones[i];
    if (p.contextKeyword) {
      const kw = p.contextKeyword.toLowerCase();
      if (/gestor|gestora/.test(kw)) {
        const targetIdx = managerIndex >= 0 ? managerIndex : peopleCount - 1;
        if (!used.has(targetIdx)) {
          result[targetIdx] = { phone: p.phone, role: "manager" };
          used.add(targetIdx);
          continue;
        }
      }
      if (/est[áa]\s+com|falar\s+com|fale\s+com|ve[ií]culo\s+com|carro\s+com|procurar|a\/c/.test(kw)) {
        const targetIdx = vehicleHolderIndices.find((vi) => !used.has(vi));
        if (targetIdx !== undefined) {
          result[targetIdx] = { phone: p.phone, role: "vehicle_holder" };
          used.add(targetIdx);
          continue;
        }
      }
    }
  }

  let phoneIdx = 0;
  for (let i = 0; i < peopleCount && phoneIdx < phones.length; i++) {
    if (!used.has(i)) {
      result[i] = { phone: phones[phoneIdx].phone, role: "positional" };
      phoneIdx++;
    }
  }

  return result;
}
