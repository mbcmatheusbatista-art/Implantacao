export function extractFirstName(fullName: string | null | undefined): string {
  if (!fullName) return "";
  let s = String(fullName);
  // Remove parenthesized content
  s = s.replace(/\([^)]*\)/g, " ");
  // Remove "está com ..." tail
  s = s.replace(/est[áa]\s+com.*$/i, " ");
  // Remove numbers (like phone in name)
  s = s.replace(/\d+/g, " ");
  // Remove separators
  s = s.replace(/[\/\-\|,;]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  const first = s.split(" ")[0] ?? "";
  if (!first) return "";
  return capitalize(first);
}

function capitalize(word: string): string {
  const lower = word.toLocaleLowerCase("pt-BR");
  return lower.charAt(0).toLocaleUpperCase("pt-BR") + lower.slice(1);
}
