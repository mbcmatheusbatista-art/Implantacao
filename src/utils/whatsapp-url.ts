import { normalizeBrazilianPhone } from "./normalize-phone";

const VALID_DDD_SET = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43,
  44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77,
  79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

/**
 * Build a WhatsApp deep-link URL.
 * First tries strict Brazilian normalization; if that fails but the raw string
 * has 8-11 digits starting with a valid DDD, uses those digits directly so the
 * button is never disabled for borderline numbers (e.g. typed without the 9th
 * mobile digit or without separators).
 */
export function buildWhatsAppUrl(phone: string, message: string): string | null {
  if (!phone || !phone.trim()) return null;
  const result = normalizeBrazilianPhone(phone);
  if (result.primary) {
    return `whatsapp://send?phone=${result.primary}&text=${encodeURIComponent(message)}`;
  }
  // Fallback: strip non-digits and +55 prefix, then check if we have a usable number
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length > 11) digits = digits.slice(2);
  if (digits.length >= 8 && digits.length <= 11) {
    const ddd = parseInt(digits.slice(0, 2), 10);
    if (VALID_DDD_SET.has(ddd)) {
      return `whatsapp://send?phone=55${digits}&text=${encodeURIComponent(message)}`;
    }
  }
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
