const UF_LIST = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
];

export function extractCityAndStateFromAddress(address: string | null | undefined): {
  city: string | null;
  state: string | null;
} {
  if (!address) return { city: null, state: null };
  const text = String(address)
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\bCEP\b:?/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Look for pattern ", City - UF" or " City/UF" or "City - UF, CEP"
  const patterns = [
    /,\s*([^,-]+?)\s*[-/]\s*([A-Za-z]{2})(?:\s*[,.]|\s*\d{5}|\s*$)/,
    /,\s*([A-Za-zÀ-ÿ\s]+?),\s*([A-Za-z]{2})\b/,
    /,\s*([A-Za-zÀ-ÿ\s]+?)\s+([A-Za-z]{2})(?:\s*[,.]|\s*\d{5}|\s*$)/,
    /-\s*([^,-]+?)\s*[-/]\s*([A-Za-z]{2})\b/,
    /\b([A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+){0,4})\s+([A-Za-z]{2})(?:\s*[,.]|\s*\d{5}|\s*$)/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const city = m[1].trim();
      const uf = m[2].toUpperCase();
      if (UF_LIST.includes(uf) && city.length > 1 && city.length < 60) {
        return { city, state: uf };
      }
    }
  }
  // fallback: find any UF token
  const ufMatch = text.match(/\b([A-Z]{2})\b/g);
  if (ufMatch) {
    for (const cand of ufMatch) {
      if (UF_LIST.includes(cand)) return { city: null, state: cand };
    }
  }
  return { city: null, state: null };
}

export { UF_LIST };
