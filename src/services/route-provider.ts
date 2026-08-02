export interface RouteResult {
  latLngs: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
}

export type RouteProvider = "osrm" | "stadia";

/**
 * Provedor de rota ativo, definido por VITE_ROUTE_PROVIDER.
 * - "osrm" (padrao): servidor publico OSRM, gratuito e sem chave;
 * - "stadia": Valhalla hospedado na Stadia Maps, exige a chave
 *   VITE_STADIA_MAPS_API_KEY (a mesma usada nas tiles do mapa).
 */
export function getActiveRouteProvider(): RouteProvider {
  const provider = ((import.meta.env?.VITE_ROUTE_PROVIDER as string | undefined) || "")
    .toLocaleLowerCase("pt-BR")
    .trim();
  const hasStadiaKey = Boolean(
    ((import.meta.env?.VITE_STADIA_MAPS_API_KEY as string | undefined) || "").trim(),
  );
  if (provider === "stadia" && hasStadiaKey) return "stadia";
  return "osrm";
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const ROUTE_TIMEOUT = 15000;

/**
 * Rota real via OSRM (Open Source Routing Machine, gratuito, sem chave).
 * OSRM recebe [longitude, latitude] separados por ';'.
 */
async function osrmRoute(
  start: { lat: number; lng: number },
  end: { lat: number; lng: number },
): Promise<RouteResult | null> {
  const url = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;
  const response = await fetchWithTimeout(url, {}, ROUTE_TIMEOUT);
  if (!response.ok) return null;
  const data = (await response.json()) as {
    routes?: {
      distance?: number;
      duration?: number;
      geometry?: { coordinates?: [number, number][] };
    }[];
  };
  const route = data.routes?.[0];
  const coordinates = route?.geometry?.coordinates;
  if (!coordinates || coordinates.length === 0) return null;
  // OSRM retorna [longitude, latitude]; o Leaflet espera [latitude, longitude].
  return {
    latLngs: coordinates.map(([lng, lat]) => [lat, lng]),
    distanceMeters: route.distance ?? 0,
    durationSeconds: route.duration ?? 0,
  };
}

/**
 * Decodifica uma polyline com precisao 6 (formato usado pelo Valhalla da
 * Stadia, "shape"). Nao exige dependencias externas.
 */
function decodePolyline6(encoded: string): [number, number][] {
  const coords: [number, number][] = [];
  const factor = 1e6;
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    coords.push([lat / factor, lng / factor]);
  }
  return coords;
}

/**
 * Rota via Valhalla hospedado na Stadia Maps (exige a mesma chave das tiles).
 * resposta: trip.legs[0].shape (polyline6) e summary.length (km) / .time (s).
 */
async function stadiaRoute(
  start: { lat: number; lng: number },
  end: { lat: number; lng: number },
): Promise<RouteResult | null> {
  const apiKey = ((import.meta.env?.VITE_STADIA_MAPS_API_KEY as string | undefined) || "").trim();
  if (!apiKey) return null;
  const url = `https://routing.stadiamaps.com/route?api_key=${encodeURIComponent(apiKey)}`;
  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locations: [
          { lat: start.lat, lon: start.lng },
          { lat: end.lat, lon: end.lng },
        ],
        costing: "auto",
        units: "kilometers",
      }),
    },
    ROUTE_TIMEOUT,
  );
  if (!response.ok) return null;
  const data = (await response.json()) as {
    trip?: {
      legs?: { shape?: string; summary?: { length?: number; time?: number } }[];
      summary?: { length?: number; time?: number };
    };
  };
  const trip = data.trip;
  const shape = trip?.legs?.[0]?.shape;
  if (!trip || !shape) return null;
  const latLngs = decodePolyline6(shape);
  if (latLngs.length === 0) return null;
  const summary = trip.legs?.[0]?.summary || trip.summary;
  return {
    latLngs,
    // O Valhalla retorna length em quilometros e time em segundos.
    distanceMeters: Math.round((summary?.length ?? 0) * 1000),
    durationSeconds: summary?.time ?? 0,
  };
}

/**
 * Calcula a rota real ponto-a-ponto usando o provedor configurado em
 * VITE_ROUTE_PROVIDER. Se o Stadia falhar, cai para o OSRM como fallback.
 * Retorna null quando nenhum provedor consegue devolver a geometria.
 */
export async function fetchRoute(
  start: { lat: number; lng: number },
  end: { lat: number; lng: number },
): Promise<RouteResult | null> {
  const provider = getActiveRouteProvider();
  if (provider === "stadia") {
    const result = await stadiaRoute(start, end);
    if (result) return result;
    console.warn("[ROTA] Stadia indisponivel, usando OSRM como fallback.");
    return osrmRoute(start, end);
  }
  return osrmRoute(start, end);
}
