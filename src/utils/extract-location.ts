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

const STATE_NAME_TO_UF: Record<string, string> = {
  "acre": "AC",
  "alagoas": "AL",
  "amapa": "AP",
  "amazonas": "AM",
  "bahia": "BA",
  "ceara": "CE",
  "distrito federal": "DF",
  "espirito santo": "ES",
  "goias": "GO",
  "maranhao": "MA",
  "mato grosso": "MT",
  "mato grosso do sul": "MS",
  "minas gerais": "MG",
  "para": "PA",
  "paraiba": "PB",
  "parana": "PR",
  "pernambuco": "PE",
  "piaui": "PI",
  "rio de janeiro": "RJ",
  "rio grande do norte": "RN",
  "rio grande do sul": "RS",
  "rondonia": "RO",
  "roraima": "RR",
  "santa catarina": "SC",
  "sao paulo": "SP",
  "sergipe": "SE",
  "tocantins": "TO",
};

/** Removes a Google Maps (or any web) link appended to an address. */
export function stripAddressLinks(address: string | null | undefined): string {
  return String(address || "")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractCityAndStateFromAddress(address: string | null | undefined): {
  city: string | null;
  state: string | null;
} {
  if (!address) return { city: null, state: null };
  let text = stripAddressLinks(address)
    .replace(/[–—]/g, "-")
    .replace(/\bCEP\b:?/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Remove Google Plus codes (e.g. "F252+X2")
  text = text.replace(/^[A-Z0-9]+\+[A-Z0-9]+\s*/i, "");
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");

  // Try: match "City, StateName" with normalized text first (most reliable for Plus code addresses)
  const fallbackStateMatch = normalized.match(/^(.+?),\s*([a-z\s]+)$/);
  if (fallbackStateMatch) {
    const stateName = fallbackStateMatch[2].trim();
    const uf = STATE_NAME_TO_UF[stateName];
    if (uf) {
      const city = fallbackStateMatch[1].trim().split(/[-,/]+/).pop()?.trim();
      if (city && city.length > 1 && city.length < 60) {
        return { city, state: uf };
      }
    }
  }

  // Look for pattern ", City - UF" or " City/UF" or "City - UF, CEP"
  const patterns = [
    /,\s*([^,-]+?)\s*[-/]\s*([A-Za-z]{2})(?:\s*[,.\-]|\s*\d{5}|\s*$)/,
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
  // Match ", City, StateName" where StateName is a known full state name (e.g. "São Paulo")
  const stateNamePattern = /,\s*([A-Za-zÀ-ÿ\s]+?),\s*([A-Za-zÀ-ÿ\s]+?)$/;
  const stateNameMatch = text.match(stateNamePattern);
  if (stateNameMatch) {
    const city = stateNameMatch[1].trim();
    const stateName = stateNameMatch[2].trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const uf = STATE_NAME_TO_UF[stateName];
    if (uf && city.length > 1 && city.length < 60) {
      return { city, state: uf };
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
