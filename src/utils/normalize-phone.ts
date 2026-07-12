import type { PhoneNormalizationResult } from "@/types";

const VALID_DDD = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43,
  44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77,
  79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

const IMPORT_DEBUG = true;

function debugImport(label: string, data: unknown) {
  if (!IMPORT_DEBUG) return;
  console.log(`[IMPORT DEBUG][PHONE] ${label}`, data);
}

/**
 * Extract candidate numeric sequences from raw text. Handles formats like:
 *   "(51) 99728-8666 / (51) 2677-1382"
 *   "51-99728-8666 (51 97062098)"
 *   "(21) 98451-6530 (27 999618876)"
 *   "12 997249419 (11 97424131)"
 */
export function extractPhoneCandidates(raw: string): string[] {
  if (!raw) return [];
  const candidates: string[] = [];
  debugImport("extract:start", { raw });

  // Match optional +55, optional (DDD) or DDD, then 8 or 9 digits (with optional separators).
  const phoneRegex = /(?:\+?55[\s.-]*)?\(?\s*(\d{2})\s*\)?[\s.-]*(9?\d{4})[\s.-]*(\d{4})/g;
  let m: RegExpExecArray | null;
  while ((m = phoneRegex.exec(raw)) !== null) {
    const digits = (m[1] + m[2] + m[3]).replace(/\D/g, "");
    if (digits.length >= 10 && digits.length <= 11 && !candidates.includes(digits)) {
      candidates.push(digits);
    }
  }

  if (candidates.length > 0) return candidates;

  // Fallback: split on textual separators and parentheses.
  const parts = raw.split(/\s*(?:\/|\bou\b|\bOU\b|\bE\b|\be\b|;|,|\||\bor\b|\(|\))\s*/i);
  for (const p of parts) {
    const digits = p.replace(/\D/g, "");
    if (digits.length >= 8 && !candidates.includes(digits)) candidates.push(digits);
  }
  if (candidates.length === 0) {
    const digits = raw.replace(/\D/g, "");
    if (digits.length >= 8) candidates.push(digits);
  }
  debugImport("extract:end", { raw, candidates });
  return candidates;
}

function stripCountryCode(digits: string): string {
  if (digits.length > 11 && digits.startsWith("55")) return digits.slice(2);
  return digits;
}

/**
 * Try to recover a number with fewer than 10 digits by checking if the first
 * two digits form a valid Brazilian DDD. Accepts 8 and 9-digit totals where
 * the local part is 6 or 7 digits (older Brazilian fixed-line format).
 *
 * e.g. "992577255" (9 digits) → DDD=99, local=2577255 → accepted as `55992577255`
 */
function tryRecoverWithEmbeddedDDD(digits: string): string | null {
  if (digits.length === 8 || digits.length === 9) {
    const maybeDDD = parseInt(digits.slice(0, 2), 10);
    if (VALID_DDD.has(maybeDDD)) {
      debugImport("validate:recovered-short-number", { digits, maybeDDD });
      return `55${digits}`;
    }
  }
  return null;
}

function validateAndFormat(digits: string): string | null {
  const local = stripCountryCode(digits);
  if (local.length !== 10 && local.length !== 11) {
    const recovered = tryRecoverWithEmbeddedDDD(local);
    if (recovered) return recovered;
    debugImport("validate:invalid-length", { digits, local, length: local.length });
    return null;
  }
  const ddd = parseInt(local.slice(0, 2), 10);
  if (!VALID_DDD.has(ddd)) {
    debugImport("validate:invalid-ddd", { digits, local, ddd });
    return null;
  }
  return `55${local}`;
}

export function normalizeBrazilianPhone(
  phone: string | null | undefined,
): PhoneNormalizationResult {
  debugImport("normalize:start", { phone });
  if (!phone || !String(phone).trim()) {
    const result: PhoneNormalizationResult = { primary: null, all: [], status: "empty" };
    debugImport("normalize:end", { phone, result });
    return result;
  }
  const candidates = extractPhoneCandidates(String(phone));
  const valid: string[] = [];
  for (const c of candidates) {
    const v = validateAndFormat(c);
    if (v && !valid.includes(v)) valid.push(v);
  }
  if (valid.length === 0) {
    const result: PhoneNormalizationResult = {
      primary: null,
      all: candidates,
      status: "invalid",
      reason: "Telefone inválido ou não identificado.",
    };
    debugImport("normalize:end", { phone, candidates, valid, result });
    return result;
  }
  // Prefer mobile (11-digit local starting with 9)
  const mobile = valid.find((v) => v.length === 13 && v[4] === "9");
  const result: PhoneNormalizationResult = {
    primary: mobile ?? valid[0],
    all: valid,
    status: "valid",
  };
  debugImport("normalize:end", { phone, candidates, valid, result });
  return result;
}

export function formatPhoneForDisplay(normalized: string | null): string {
  if (!normalized) return "";
  // 55DDDNNNNNNNN or 55DDDNNNNNNNNN
  const local = normalized.startsWith("55") ? normalized.slice(2) : normalized;
  if (local.length === 11) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  }
  if (local.length === 10) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  }
  // 9-digit: DDD(2) + local(7) – old fixed-line format
  if (local.length === 9) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  }
  // 8-digit: DDD(2) + local(6)
  if (local.length === 8) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 5)}-${local.slice(5)}`;
  }
  return normalized;
}

