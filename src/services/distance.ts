import type { ConfirmedService, Technician } from "@/types";

export interface RouteDistance {
  distanceMeters: number;
  distanceText: string;
  durationText: string;
}

const ROUTE_CACHE_KEY = "creare_google_route_cache_v2";
const ROUTE_CACHE_MIGRATION_KEY = "creare_route_cache_fallback_v2";

function removeStaleNullRouteCache() {
  try {
    if (localStorage.getItem(ROUTE_CACHE_MIGRATION_KEY) === "1") return;
    localStorage.removeItem(ROUTE_CACHE_KEY);
    localStorage.setItem(ROUTE_CACHE_MIGRATION_KEY, "1");
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
  return cleanAddress([technician.cityOriginal, technician.state].filter(Boolean).join(", "));
}

function getServiceDestination(service: ConfirmedService): string {
  return cleanAddress(
    service.fullAddress || [service.cityDetected, service.stateDetected].filter(Boolean).join(", "),
  );
}

function loadRouteCache(): Record<string, RouteDistance | null> {
  try {
    removeStaleNullRouteCache();
    const raw = localStorage.getItem(ROUTE_CACHE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, RouteDistance | null>) : {};
  } catch {
    return {};
  }
}

function saveRouteCache(cache: Record<string, RouteDistance | null>) {
  try {
    localStorage.setItem(ROUTE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* ignore */
  }
}

export function buildGoogleMapsRouteUrl(technician: Technician, service: ConfirmedService): string {
  const origin = getTechnicianOrigin(technician);
  const destination = getServiceDestination(service);
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("travelmode", "driving");
  if (origin) url.searchParams.set("origin", `${origin}, Brasil`);
  if (destination) url.searchParams.set("destination", `${destination}, Brasil`);
  return url.toString();
}

export async function calculateTechnicianRoute(
  technician: Technician,
  service: ConfirmedService,
): Promise<RouteDistance | null> {
  const origin = getTechnicianOrigin(technician);
  const destination = getServiceDestination(service);
  if (!origin || !destination) return null;

  const cacheKey = `${origin}|${destination}`.toLocaleLowerCase("pt-BR");
  const cache = loadRouteCache();
  if (cacheKey in cache) return cache[cacheKey];

  try {
    const response = await fetch("/api/route-distance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ origin, destination }),
    });
    if (!response.ok) throw new Error(`Route API failed: ${response.status}`);
    const result = (await response.json()) as RouteDistance | null;
    if (result) {
      cache[cacheKey] = result;
      saveRouteCache(cache);
    }
    return result;
  } catch (error) {
    console.warn("[DISTANCE] Não foi possível calcular rota pelo Google", {
      origin,
      destination,
      error,
    });
    return null;
  }
}
