import { normalizeBrazilianPhone } from "./normalize-phone";

const VALID_DDD_SET = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43,
  44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77,
  79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

const WHATSAPP_DEBUG = true;

function debugWhatsApp(label: string, data: unknown) {
  if (!WHATSAPP_DEBUG) return;
  console.log(`[WHATSAPP DEBUG] ${label}`, data);
}

/**
 * Build a WhatsApp deep-link URL.
 * First tries strict Brazilian normalization; if that fails but the raw string
 * has 8-11 digits starting with a valid DDD, uses those digits directly so the
 * button is never disabled for borderline numbers (e.g. typed without the 9th
 * mobile digit or without separators).
 *
 * As a last resort, if the number has 12-13 digits (with country code), strip
 * the country code and try again.
 */
export function buildWhatsAppUrl(phone: string, message: string): string | null {
  debugWhatsApp("build:start", { phone, messageLength: message.length });

  if (!phone || !phone.trim()) {
    debugWhatsApp("build:empty-phone", { phone });
    return null;
  }

  // 1. Try strict normalization
  const result = normalizeBrazilianPhone(phone);
  if (result.primary) {
    const url = `whatsapp://send?phone=${result.primary}&text=${encodeURIComponent(message)}`;
    debugWhatsApp("build:success-normalize", { phone, primary: result.primary, url });
    return url;
  }
  debugWhatsApp("build:normalize-failed", { phone, all: result.all, reason: result.reason });

  // 2. Fallback: strip non-digits and check if we have a usable number
  let digits = phone.replace(/\D/g, "");
  debugWhatsApp("build:fallback-digits", { phone, digits, length: digits.length });

  // If number has 12-13 digits and starts with 55, strip country code
  if (digits.startsWith("55") && digits.length >= 12) {
    digits = digits.slice(2);
    debugWhatsApp("build:fallback-stripped-55", { digits, length: digits.length });
  }

  if (digits.length >= 8 && digits.length <= 11) {
    const ddd = parseInt(digits.slice(0, 2), 10);
    debugWhatsApp("build:fallback-checking-ddd", { digits, ddd, validDdd: VALID_DDD_SET.has(ddd) });
    if (VALID_DDD_SET.has(ddd)) {
      const url = `whatsapp://send?phone=55${digits}&text=${encodeURIComponent(message)}`;
      debugWhatsApp("build:success-fallback", { digits, ddd, url });
      return url;
    }
  }

  // 3. Last resort: try removing country code 55 from ANY position
  // (some users paste "+55 (51) 99728-8666" where stripping leaves "5551997288666")
  if (digits.length > 11) {
    const cleaned = digits.replace(/^55/, "");
    if (cleaned.length >= 10 && cleaned.length <= 11) {
      const ddd = parseInt(cleaned.slice(0, 2), 10);
      if (VALID_DDD_SET.has(ddd)) {
        const url = `whatsapp://send?phone=55${cleaned}&text=${encodeURIComponent(message)}`;
        debugWhatsApp("build:success-last-resort", { cleaned, ddd, url });
        return url;
      }
    }
  }

  // 4. ULTIMATE brute-force: any 8+ digit string, try first 2 digits as DDD
  // Covers edge cases where the regex failed (e.g. weird spacing, multiple numbers)
  const allDigits = phone.replace(/\D/g, "");
  const testDigits = allDigits.startsWith("55") && allDigits.length > 11 ? allDigits.slice(2) : allDigits;
  if (testDigits.length >= 8) {
    const ddd = parseInt(testDigits.slice(0, 2), 10);
    debugWhatsApp("build:ultimate-brute-force", { testDigits, ddd, validDdd: VALID_DDD_SET.has(ddd) });
    if (VALID_DDD_SET.has(ddd)) {
      const url = `whatsapp://send?phone=55${testDigits}&text=${encodeURIComponent(message)}`;
      debugWhatsApp("build:success-ultimate", { testDigits, ddd, url });
      return url;
    }
    // If DDD is not valid, still try with just the digits (WhatsApp might still work)
    if (testDigits.length >= 10) {
      const url = `whatsapp://send?phone=55${testDigits}&text=${encodeURIComponent(message)}`;
      debugWhatsApp("build:success-ultimate-no-ddd-check", { testDigits, url });
      return url;
    }
  }

  debugWhatsApp("build:failed-all", { phone, digits: testDigits });
  return null;
}

export function openWhatsAppInReusableTab(url: string): Window | null {
  window.location.href = url;
  return window;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
