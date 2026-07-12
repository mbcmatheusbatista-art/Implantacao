import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

interface RouteDistanceRequest {
  origin?: unknown;
  destination?: unknown;
  mode?: "approximate" | "exact" | "auto";
}

function getEnvValue(env: unknown, key: string): string {
  if (env && typeof env === "object" && key in env) {
    const value = (env as Record<string, unknown>)[key];
    return typeof value === "string" ? value.trim() : "";
  }
  return process.env[key]?.trim() ?? "";
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters} m`;
  return `${Math.round(meters / 1000)} km`;
}

function formatDuration(duration: string): string {
  const seconds = Number(duration.replace("s", ""));
  if (!Number.isFinite(seconds) || seconds <= 0) return "tempo indisponível";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours <= 0) return `${minutes} min`;
  if (minutes <= 0) return `${hours}h`;
  return `${hours}h${String(minutes).padStart(2, "0")}`;
}

const geocodeCache = new Map<string, { lat: number; lng: number } | null>();

async function geocodeAddress(query: string): Promise<{ lat: number; lng: number } | null> {
  const key = query.toLocaleLowerCase("pt-BR");
  if (geocodeCache.has(key)) return geocodeCache.get(key) ?? null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "creare-distribuicao/1.0 (support@lovable.dev)",
        "Accept-Language": "pt-BR",
      },
    });
    if (!res.ok) {
      geocodeCache.set(key, null);
      return null;
    }
    const arr = (await res.json()) as { lat: string; lon: string }[];
    if (!arr[0]) {
      geocodeCache.set(key, null);
      return null;
    }
    const coord = { lat: parseFloat(arr[0].lat), lng: parseFloat(arr[0].lon) };
    geocodeCache.set(key, coord);
    return coord;
  } catch (error) {
    console.warn("[DISTANCE] geocode falhou", { query, error });
    geocodeCache.set(key, null);
    return null;
  }
}

function haversineMeters(
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

async function computeWithGoogle(
  origin: string,
  destination: string,
  apiKey: string,
  referer: string,
) {
  const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Referer: referer,
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
    },
    body: JSON.stringify({
      origin: { address: `${origin}, Brasil` },
      destination: { address: `${destination}, Brasil` },
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_UNAWARE",
      languageCode: "pt-BR",
      units: "METRIC",
    }),
  });
  if (!response.ok) {
    console.warn("[DISTANCE] Google Routes falhou", {
      status: response.status,
      body: await response.text(),
    });
    return null;
  }
  const payload = (await response.json()) as {
    routes?: { distanceMeters?: number; duration?: string }[];
  };
  const route = payload.routes?.[0];
  if (!route?.distanceMeters || !route.duration) return null;
  return {
    distanceMeters: route.distanceMeters,
    distanceText: formatDistance(route.distanceMeters),
    durationText: formatDuration(route.duration),
  };
}

async function computeWithFallback(origin: string, destination: string) {
  const [o, d] = await Promise.all([geocodeAddress(origin), geocodeAddress(destination)]);
  if (!o || !d) return null;
  // Approximate road distance by scaling straight-line by 1.3.
  const straight = haversineMeters(o, d);
  const meters = Math.round(straight * 1.3);
  // Approximate driving time at 75 km/h average.
  const seconds = Math.round((meters / 1000 / 75) * 3600);
  return {
    distanceMeters: meters,
    distanceText: `~${formatDistance(meters)}`,
    durationText: `~${formatDuration(`${seconds}s`)}`,
  };
}

async function handleRouteDistance(request: Request, env: unknown): Promise<Response> {
  const body = (await request.json()) as RouteDistanceRequest;
  const origin = typeof body.origin === "string" ? body.origin.trim() : "";
  const destination = typeof body.destination === "string" ? body.destination.trim() : "";
  const mode = body.mode ?? "auto";
  if (!origin || !destination) return Response.json(null);

  const apiKey = getEnvValue(env, "GOOGLE_MAPS_API_KEY");
  const referer = getEnvValue(env, "GOOGLE_MAPS_REFERER") || "http://127.0.0.1:8080/";

  try {
    if (mode === "exact") {
      if (!apiKey) return Response.json(null);
      const result = await computeWithGoogle(origin, destination, apiKey, referer);
      return Response.json(result);
    }
    if (mode === "approximate") {
      const fallback = await computeWithFallback(origin, destination);
      return Response.json(fallback);
    }
    // mode === "auto" (legacy)
    if (apiKey) {
      const result = await computeWithGoogle(origin, destination, apiKey, referer);
      if (result) return Response.json(result);
    }
    const fallback = await computeWithFallback(origin, destination);
    return Response.json(fallback);
  } catch (error) {
    console.warn("[DISTANCE] Erro ao calcular rota", { error });
    return Response.json(null);
  }
}

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);
      if (request.method === "POST" && url.pathname === "/api/route-distance") {
        return await handleRouteDistance(request, env);
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
