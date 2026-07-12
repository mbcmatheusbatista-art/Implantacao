import { normalizeBrazilianPhone } from "./normalize-phone";

export function buildWhatsAppUrl(phone: string, message: string): string | null {
  const result = normalizeBrazilianPhone(phone);
  if (!result.primary) return null;
  return `whatsapp://send?phone=${result.primary}&text=${encodeURIComponent(message)}`;
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
