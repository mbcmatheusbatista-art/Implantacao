import type { ConfirmedService, Technician } from "@/types";
import { brCityCoords } from "./br-city-coords";

export interface RouteDistance {
  distanceMeters: number;
  distanceText: string;
  durationText: string;
}

/**
 * Separate caches for approximate (free) vs exact (Google) routes.
 * Key format: "origin|destination" normalized to lowercase.
 */

const CACHE_VERSION = "v5";
const APPROX_CACHE_KEY = `creare_approx_route_cache_${CACHE_VERSION}`;
const EXACT_CACHE_KEY = `creare_exact_route_cache_${CACHE_VERSION}`;

function loadCache<T>(key: string): Record<string, T> {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Record<string, T>) : {};
  } catch {
    return {};
  }
}

function saveCache<T>(key: string, cache: Record<string, T>) {
  try {
    localStorage.setItem(key, JSON.stringify(cache));
  } catch {
    /* ignore */
  }
}

function cleanAddress(value: string): string {
  return value
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getTechnicianOrigin(technician: Technician): string {
  return cleanAddress(
    technician.address || [technician.cityOriginal, technician.state].filter(Boolean).join(", "),
  );
}

export function getServiceDestination(service: ConfirmedService): string {
  if (service.cityDetected) {
    return cleanAddress([service.cityDetected, service.stateDetected].filter(Boolean).join(", "));
  }
  return cleanAddress(service.fullAddress);
}

function getCacheKey(technician: Technician, service: ConfirmedService): string {
  const origin = getTechnicianOrigin(technician);
  const destination = getServiceDestination(service);
  return `${origin}|${destination}`.toLocaleLowerCase("pt-BR");
}

export function buildGoogleMapsRouteUrl(technician: Technician, service: ConfirmedService): string {
  // A Maps route must use the actual two registered addresses.  Falling back
  // to a city (or omitting origin) makes Google use the user's location.
  const origin = cleanAddress(technician.address || "");
  const destination = cleanAddress(service.fullAddress || "");
  if (!origin || !destination) return "";
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("travelmode", "driving");
  url.searchParams.set("origin", origin);
  url.searchParams.set("destination", destination);
  return url.toString();
}

export function normalize(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,;:!?]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractCity(query: string): string {
  let cleaned = query
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Full Brazilian addresses commonly end with a CEP. Remove it before
  // locating the UF so a fixed technician address resolves to its real city.
  cleaned = cleaned
    .replace(/\bCEP\s*\d{5}-?\d{3}\b/gi, "")
    .replace(/\b\d{5}-?\d{3}\b/g, "")
    .replace(/[\s,;]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
  // Remove Google Plus codes like "J2RJ+7XV" or "J2RJ+7XV " before city name
  cleaned = cleaned.replace(/^[A-Z0-9]+\+[A-Z0-9]+\s*/i, "");
  // Remove parenthetical suffixes like "(BH)" from city names
  cleaned = cleaned.replace(/\s*\([^)]*\)\s*/g, " ");
  // Strip trailing alphanumeric codes that appear after state (e.g. "TDR6H01")
  cleaned = cleaned.replace(/\s+[A-Z0-9]{5,}$/i, " ");
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  // Find state abbreviation (2 uppercase letters) at the end
  let stateMatch = cleaned.match(/([A-Z]{2})$/);
  if (!stateMatch) {
    const lower = cleaned
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR");
    const knownStates: [string, string][] = [
      ["acre", "ac"], ["alagoas", "al"], ["amapa", "ap"], ["amazonas", "am"],
      ["bahia", "ba"], ["ceara", "ce"], ["distrito federal", "df"], ["espirito santo", "es"],
      ["goias", "go"], ["maranhao", "ma"], ["mato grosso", "mt"], ["mato grosso do sul", "ms"],
      ["minas gerais", "mg"], ["para", "pa"], ["paraiba", "pb"], ["parana", "pr"],
      ["pernambuco", "pe"], ["piaui", "pi"], ["rio de janeiro", "rj"],
      ["rio grande do norte", "rn"], ["rio grande do sul", "rs"], ["rondonia", "ro"],
      ["roraima", "rr"], ["santa catarina", "sc"], ["sao paulo", "sp"],
      ["sergipe", "se"], ["tocantins", "to"],
    ];
    for (const [name, uf] of knownStates) {
      if (lower.endsWith(name)) {
        cleaned = cleaned.slice(0, -name.length).trim();
        stateMatch = [uf, uf];
        break;
      }
    }
  }
  if (!stateMatch) return normalize(cleaned.toLocaleLowerCase("pt-BR"));
  const state = stateMatch[1].toLocaleLowerCase("pt-BR");
  // Remove the state suffix (" - SP", ", SP", "/SP", " SP") from the end
  const beforeState = cleaned.slice(0, -stateMatch[0].length).replace(/[\s,/-]+$/, "");
  // Split by common separators and take the last segment as the city
  const parts = beforeState.split(/[-,/]+/).map((p) => p.trim()).filter(Boolean);
  const city = parts[parts.length - 1];
  if (city) return `${normalize(city.toLocaleLowerCase("pt-BR"))}, ${state}`;
  return normalize(cleaned.toLocaleLowerCase("pt-BR"));
}

let lastNominatimCall = 0;

// Map of state → capital city key (normalized for brCityCoords lookup)
const STATE_CAPITAL: Record<string, string> = {
  ac: "rio branco, ac",
  al: "maceio, al",
  am: "manaus, am",
  ap: "macapa, ap",
  ba: "salvador, ba",
  ce: "fortaleza, ce",
  df: "brasilia, df",
  es: "vitoria, es",
  go: "goiania, go",
  ma: "sao luis, ma",
  mg: "belo horizonte, mg",
  ms: "campo grande, ms",
  mt: "cuiaba, mt",
  pa: "belem, pa",
  pb: "joao pessoa, pb",
  pe: "recife, pe",
  pi: "teresina, pi",
  pr: "curitiba, pr",
  rj: "rio de janeiro, rj",
  rn: "natal, rn",
  ro: "porto velho, ro",
  rr: "boa vista, rr",
  rs: "porto alegre, rs",
  sc: "florianopolis, sc",
  se: "aracaju, se",
  sp: "sao paulo, sp",
  to: "palmas, to",
};

async function geocodeAddress(query: string): Promise<{ lat: number; lng: number } | null> {
  const lookupKey = extractCity(query);
  const staticCoords = brCityCoords[lookupKey];
  if (staticCoords) {
    return staticCoords;
  }

  // Fallback to Nominatim with rate limiting (1 req/s)
  const now = Date.now();
  const elapsed = now - lastNominatimCall;
  if (elapsed < 1100) {
    await new Promise((r) => setTimeout(r, 1100 - elapsed));
  }
  lastNominatimCall = Date.now();

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(query)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "creare-distribuicao/1.0 (support@lovable.dev)",
        "Accept-Language": "pt-BR",
      },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const arr = (await res.json()) as { lat: string; lon: string }[];
    if (!arr[0]) return null;
    return { lat: parseFloat(arr[0].lat), lng: parseFloat(arr[0].lon) };
  } catch {
    // Last resort: use state capital coordinates as rough estimate
    const parts = lookupKey.split(", ");
    const stateKey = parts[parts.length - 1]?.toLowerCase();
    if (stateKey && STATE_CAPITAL[stateKey]) {
      return brCityCoords[STATE_CAPITAL[stateKey]] ?? null;
    }
    return null;
  }
}

export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Geocode a full street address via Nominatim (street-level).
 * Bypasses brCityCoords for true street-level coordinates.
 */
let lastNominatimCallFull = 0;
export async function geocodeFullAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const now = Date.now();
  const elapsed = now - lastNominatimCallFull;
  if (elapsed < 1100) {
    await new Promise((r) => setTimeout(r, 1100 - elapsed));
  }
  lastNominatimCallFull = Date.now();
  try {
    // Resolve through the app server. Browser-side Nominatim requests are
    // frequently blocked by CORS, which previously left fixed technician
    // addresses without a map marker.
    const localResponse = await fetch("/api/geocode-fixed-address", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    });
    if (localResponse.ok) {
      const payload = (await localResponse.json()) as {
        coordinates?: { lat?: number; lng?: number } | null;
      };
      const coordinates = payload.coordinates;
      if (coordinates && Number.isFinite(coordinates.lat) && Number.isFinite(coordinates.lng)) {
        return { lat: coordinates.lat!, lng: coordinates.lng! };
      }
      return null;
    }

    // Retained as a development fallback when the local API is unavailable.
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(address)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "creare-distribuicao/1.0 (support@lovable.dev)",
        "Accept-Language": "pt-BR",
      },
    });
    if (!res.ok) return null;
    const arr = (await res.json()) as { lat: string; lon: string }[];
    if (!arr[0]) return null;
    return { lat: parseFloat(arr[0].lat), lng: parseFloat(arr[0].lon) };
  } catch {
    return null;
  }
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters} m`;
  return `${Math.round(meters / 1000)} km`;
}

function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return "tempo indisponível";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  if (hours <= 0) return `${minutes} min`;
  if (minutes <= 0) return `${hours}h`;
  return `${hours}h${String(minutes).padStart(2, "0")}`;
}

/**
 * Approximate route: client-side OSM geocode + haversine.
 * No Google API quota consumed. Cache in localStorage.
 */
export async function calculateApproximateRoute(
  technician: Technician,
  service: ConfirmedService,
): Promise<RouteDistance | null> {
  const origin = getTechnicianOrigin(technician);
  const destination = getServiceDestination(service);
  if (!origin || !destination) return null;

  const cacheKey = getCacheKey(technician, service);
  const cache = loadCache<RouteDistance | null>(APPROX_CACHE_KEY);
  if (cacheKey in cache) return cache[cacheKey];

  try {
    const [o, d] = await Promise.all([geocodeAddress(origin), geocodeAddress(destination)]);
    if (!o || !d) return null;
    let straight = haversineMeters(o, d);
    if (straight < 100 && technician.address && service.fullAddress) {
      straight = 5000;
    }
    const meters = Math.round(straight * 1.3);
    const seconds = Math.round((meters / 1000 / 75) * 3600);
    const result: RouteDistance = {
      distanceMeters: meters,
      distanceText: `~${formatDistance(meters)}`,
      durationText: `~${formatDuration(seconds)}`,
    };
    cache[cacheKey] = result;
    saveCache(APPROX_CACHE_KEY, cache);
    return result;
  } catch {
    cache[cacheKey] = null;
    saveCache(APPROX_CACHE_KEY, cache);
    return null;
  }
}

/**
 * Exact route (Google Routes API). Only call when user explicitly requests it.
 */
export async function calculateExactGoogleRoute(
  technician: Technician,
  service: ConfirmedService,
): Promise<RouteDistance | null> {
  const origin = getTechnicianOrigin(technician);
  const destination = getServiceDestination(service);
  if (!origin || !destination) return null;

  const cacheKey = getCacheKey(technician, service);
  // Check exact cache first
  const exactCache = loadCache<RouteDistance | null>(EXACT_CACHE_KEY);
  if (cacheKey in exactCache) return exactCache[cacheKey];

  try {
    const response = await fetch("/api/route-distance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ origin, destination, mode: "exact" }),
    });
    if (!response.ok) throw new Error(`Route API failed: ${response.status}`);
    const result = (await response.json()) as RouteDistance | null;
    exactCache[cacheKey] = result;
    saveCache(EXACT_CACHE_KEY, exactCache);
    return result;
  } catch (error) {
    console.warn("[DISTANCE] Erro rota exata Google", { origin, destination, error });
    return null;
  }
}

/**
 * Get cached approximate route for display (no API call).
 */
export function getCachedApproximateRoute(
  technician: Technician,
  service: ConfirmedService,
): RouteDistance | null | undefined {
  const cacheKey = getCacheKey(technician, service);
  const cache = loadCache<RouteDistance | null>(APPROX_CACHE_KEY);
  if (cacheKey in cache) return cache[cacheKey];
  return undefined; // not cached yet
}

/**
 * Get cached exact route for display (no API call).
 */
export function getCachedExactRoute(
  technician: Technician,
  service: ConfirmedService,
): RouteDistance | null | undefined {
  const cacheKey = getCacheKey(technician, service);
  const cache = loadCache<RouteDistance | null>(EXACT_CACHE_KEY);
  if (cacheKey in cache) return cache[cacheKey];
  return undefined; // not cached yet
}

export type RouteMode = "none" | "approximate" | "exact";

export interface RouteInfo {
  distance: RouteDistance | null;
  mode: RouteMode;
}
