import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

interface RouteDistanceRequest {
  origin?: unknown;
  destination?: unknown;
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

let lastPhotonCall = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Photon (OSM/komoot), sem chave: geocoding por texto. */
async function photonGeocode(query: string): Promise<{ lat: number; lng: number } | null> {
  const wait = Math.max(0, 1100 - (Date.now() - lastPhotonCall));
  if (wait > 0) await sleep(wait);
  lastPhotonCall = Date.now();

  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=1&countrycode=br&lang=pt`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "creare-distribuicao/1.0 (support@lovable.dev)" },
    });
    if (res.status === 429) {
      // Rate limit: aguarda e tenta uma única vez antes de desistir.
      await sleep(2500);
      const retry = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "creare-distribuicao/1.0 (support@lovable.dev)" },
      });
      if (!retry.ok) return null;
      const data = (await retry.json()) as {
        features?: { geometry?: { coordinates?: [number, number] } }[];
      };
      const coords = data.features?.[0]?.geometry?.coordinates;
      if (!coords) return null;
      return { lat: coords[1], lng: coords[0] };
    }
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: { geometry?: { coordinates?: [number, number] } }[];
    };
    const coords = data.features?.[0]?.geometry?.coordinates;
    if (!coords) return null;
    return { lat: coords[1], lng: coords[0] };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Photon (OSM/komoot), sem chave: reverse geocoding por coordenada. */
async function photonReverseGeocode(lat: number, lng: number): Promise<string | null> {
  const wait = Math.max(0, 1100 - (Date.now() - lastPhotonCall));
  if (wait > 0) await sleep(wait);
  lastPhotonCall = Date.now();

  const url = `https://photon.komoot.io/reverse?lon=${lng}&lat=${lat}&lang=pt`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "creare-distribuicao/1.0 (support@lovable.dev)" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: { properties?: { name?: string; city?: string; state?: string; country?: string } }[];
    };
    const props = data.features?.[0]?.properties;
    if (!props) return null;
    return [props.name, props.city, props.state, props.country].filter(Boolean).join(", ") || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

let lastNominatimCall = 0;

/** Fallback gratuito: Nominatim, usado quando o Photon falha ou está fora do ar. */
async function nominatimGeocode(query: string): Promise<{ lat: number; lng: number } | null> {
  const wait = Math.max(0, 1100 - (Date.now() - lastNominatimCall));
  if (wait > 0) await sleep(wait);
  lastNominatimCall = Date.now();

  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(query)}`;
  const headers = {
    "User-Agent": "creare-distribuicao/1.0 (support@lovable.dev)",
    "Accept-Language": "pt-BR",
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (res.status === 429) {
      // Rate limit: aguarda e tenta uma única vez antes de desistir.
      await sleep(2500);
      const retry = await fetch(url, { headers, signal: controller.signal });
      if (!retry.ok) return null;
      const arr = (await retry.json()) as { lat: string; lon: string }[];
      if (!arr[0]) return null;
      return { lat: parseFloat(arr[0].lat), lng: parseFloat(arr[0].lon) };
    }
    if (!res.ok) return null;
    const arr = (await res.json()) as { lat: string; lon: string }[];
    if (!arr[0]) return null;
    return { lat: parseFloat(arr[0].lat), lng: parseFloat(arr[0].lon) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function geocodeAddress(query: string): Promise<{ lat: number; lng: number } | null> {
  const key = query.toLocaleLowerCase("pt-BR");
  if (geocodeCache.has(key)) return geocodeCache.get(key) ?? null;
  const result = (await photonGeocode(query)) ?? (await nominatimGeocode(query));
  geocodeCache.set(key, result);
  return result;
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

/** Rota aproximada (grátis): geocoding OSM + distância haversine. */
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

async function handleRouteDistance(request: Request): Promise<Response> {
  const body = (await request.json()) as RouteDistanceRequest;
  const origin = typeof body.origin === "string" ? body.origin.trim() : "";
  const destination = typeof body.destination === "string" ? body.destination.trim() : "";
  if (!origin || !destination) return Response.json(null);

  try {
    const fallback = await computeWithFallback(origin, destination);
    return Response.json(fallback);
  } catch (error) {
    console.warn("[DISTANCE] Erro ao calcular rota", { error });
    return Response.json(null);
  }
}

async function handleFixedAddressGeocode(request: Request): Promise<Response> {
  const body = (await request.json()) as { address?: unknown };
  const address = typeof body.address === "string" ? body.address.trim() : "";
  if (!address || address.length > 500) {
    return Response.json({ coordinates: null }, { status: 400 });
  }
  // This runs server-side so the map does not depend on browser CORS rules.
  const coordinates = await geocodeAddress(address);
  return Response.json({ coordinates });
}

async function handleReverseGeocode(request: Request): Promise<Response> {
  const body = (await request.json()) as { lat?: unknown; lng?: unknown };
  const lat = typeof body.lat === "number" ? body.lat : Number(body.lat);
  const lng = typeof body.lng === "number" ? body.lng : Number(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return Response.json({ address: null }, { status: 400 });
  }
  const address = await photonReverseGeocode(lat, lng);
  return Response.json({ address });
}

// ---------------------------------------------------------------------------
// D1 CRUD — tecnicos
// ---------------------------------------------------------------------------

interface D1Result<T> {
  results: T[];
  success: boolean;
  error?: string;
}

interface D1PreparedStatement {
  bind(...params: unknown[]): D1PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<{ success: boolean; error?: string; meta?: unknown }>;
}

interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  exec(sql: string): Promise<{ success: boolean; error?: string }>;
}

function getDB(env: unknown): D1Database | null {
  const e = env as Record<string, unknown>;
  if (e && typeof e === "object" && "DB" in e) {
    return e.DB as D1Database;
  }
  return null;
}

async function ensureTecnicosTable(db: D1Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS tecnicos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      telefone TEXT DEFAULT '',
      endereco TEXT NOT NULL DEFAULT '',
      numero TEXT DEFAULT '',
      bairro TEXT DEFAULT '',
      cidade TEXT DEFAULT '',
      uf TEXT DEFAULT '',
      cep TEXT DEFAULT '',
      latitude REAL,
      longitude REAL,
      equipamentos TEXT DEFAULT '',
      ativo INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(nome, telefone)
    )
  `);
}

function normalizeNomeTelefone(val: string): string {
  return val.trim().toLowerCase().replace(/\s+/g, " ");
}

interface TecnicoBody {
  nome?: string;
  telefone?: string;
  endereco?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
  latitude?: number;
  longitude?: number;
  equipamentos?: string;
  ativo?: number;
}

interface ImportRow {
  nome: string;
  telefone?: string;
  endereco?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
  latitude?: number;
  longitude?: number;
  equipamentos?: string;
}

function sanitizeString(val: unknown, maxLen = 500): string {
  if (typeof val !== "string") return "";
  return val.slice(0, maxLen);
}

function sanitizeFloat(val: unknown): number | null {
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (typeof val === "string") {
    const n = parseFloat(val);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function sanitizeInt(val: unknown): number | null {
  if (typeof val === "number" && Number.isInteger(val)) return val;
  if (typeof val === "string") {
    const n = parseInt(val, 10);
    return Number.isInteger(n) ? n : null;
  }
  return null;
}

function validateTecnico(body: TecnicoBody, partial = false): string | null {
  if (!partial) {
    if (!body.nome || typeof body.nome !== "string" || !body.nome.trim()) {
      return "nome é obrigatório";
    }
    if (!body.endereco || typeof body.endereco !== "string" || !body.endereco.trim()) {
      return "endereco é obrigatório";
    }
  } else {
    if (body.nome !== undefined && (!body.nome || typeof body.nome !== "string" || !body.nome.trim())) {
      return "nome inválido";
    }
    if (body.endereco !== undefined && (!body.endereco || typeof body.endereco !== "string" || !body.endereco.trim())) {
      return "endereco inválido";
    }
  }
  if (body.telefone !== undefined && typeof body.telefone !== "string") return "telefone inválido";
  if (body.cidade !== undefined && typeof body.cidade !== "string") return "cidade inválida";
  if (body.uf !== undefined && typeof body.uf !== "string") return "uf inválido";
  if (body.cep !== undefined && typeof body.cep !== "string") return "cep inválido";
  if (body.latitude !== undefined) {
    const lat = sanitizeFloat(body.latitude);
    if (lat === null || lat < -90 || lat > 90) return "latitude inválida";
  }
  if (body.longitude !== undefined) {
    const lng = sanitizeFloat(body.longitude);
    if (lng === null || lng < -180 || lng > 180) return "longitude inválida";
  }
  return null;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function handleListTecnicos(env: unknown): Promise<Response> {
  const db = getDB(env);
  if (!db) return json({ error: "D1 não disponível" }, 503);
  try {
    await ensureTecnicosTable(db);
    const result = await db.prepare(
      "SELECT * FROM tecnicos WHERE ativo = 1 ORDER BY nome",
    ).all<Record<string, unknown>>();
    return json({ tecnicos: result.results });
  } catch (err) {
    console.error("[D1] list error", err);
    return json({ error: "Erro ao listar técnicos" }, 500);
  }
}

async function handleCreateTecnico(request: Request, env: unknown): Promise<Response> {
  let body: TecnicoBody;
  try {
    body = (await request.json()) as TecnicoBody;
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  const err = validateTecnico(body);
  if (err) return json({ error: err }, 400);

  const db = getDB(env);
  if (!db) return json({ error: "D1 não disponível" }, 503);
  try {
    await ensureTecnicosTable(db);
    const nome = normalizeNomeTelefone(sanitizeString(body.nome, 300));
    const telefone = sanitizeString(body.telefone, 50);
    const endereco = sanitizeString(body.endereco, 500);
    const numero = sanitizeString(body.numero, 30);
    const bairro = sanitizeString(body.bairro, 200);
    const cidade = sanitizeString(body.cidade, 200);
    const uf = sanitizeString(body.uf, 2);
    const cep = sanitizeString(body.cep, 10);
    const equipamentos = sanitizeString(body.equipamentos, 500);
    let latitude = sanitizeFloat(body.latitude);
    let longitude = sanitizeFloat(body.longitude);

    // Geocode address if no coordinates provided
    if ((latitude === null || longitude === null) && endereco) {
      const geoQuery = `${endereco}, ${cidade}, ${uf}, Brasil`
        .replace(/\s+/g, " ")
        .trim()
        .replace(/,$/, "");
      const coord = await geocodeAddress(geoQuery);
      if (coord) {
        latitude = coord.lat;
        longitude = coord.lng;
      }
    }

    const stmt = db.prepare(`
      INSERT INTO tecnicos (nome, telefone, endereco, numero, bairro, cidade, uf, cep, latitude, longitude, equipamentos)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(nome, telefone) DO UPDATE SET
        endereco = excluded.endereco,
        numero = excluded.numero,
        bairro = excluded.bairro,
        cidade = excluded.cidade,
        uf = excluded.uf,
        cep = excluded.cep,
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        equipamentos = excluded.equipamentos,
        updated_at = datetime('now')
    `).bind(nome, telefone, endereco, numero, bairro, cidade, uf, cep, latitude, longitude, equipamentos);
    const result = await stmt.run();
    if (!result.success) return json({ error: "Erro ao criar técnico" }, 500);

    const list = await db.prepare(
      "SELECT * FROM tecnicos WHERE id = last_insert_rowid()",
    ).all<Record<string, unknown>>();
    return json({ tecnico: list.results[0] ?? null }, 201);
  } catch (err) {
    console.error("[D1] create error", err);
    return json({ error: "Erro ao criar técnico" }, 500);
  }
}

async function handleUpdateTecnico(request: Request, env: unknown): Promise<Response> {
  const url = new URL(request.url);
  const idStr = url.pathname.split("/").pop() || "";
  const id = sanitizeInt(idStr);
  if (id === null) return json({ error: "id inválido" }, 400);

  let body: TecnicoBody;
  try {
    body = (await request.json()) as TecnicoBody;
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  const err = validateTecnico(body, true);
  if (err) return json({ error: err }, 400);

  const db = getDB(env);
  if (!db) return json({ error: "D1 não disponível" }, 503);
  try {
    await ensureTecnicosTable(db);

    const updates: string[] = [];
    const params: unknown[] = [];
    const setValue = (field: string, val: unknown) => {
      if (val !== undefined) {
        updates.push(`${field} = ?`);
        params.push(val);
      }
    };
    setValue("nome", body.nome !== undefined ? sanitizeString(body.nome, 300) : undefined);
    setValue("telefone", body.telefone !== undefined ? sanitizeString(body.telefone, 50) : undefined);
    setValue("endereco", body.endereco !== undefined ? sanitizeString(body.endereco, 500) : undefined);
    setValue("cidade", body.cidade !== undefined ? sanitizeString(body.cidade, 200) : undefined);
    setValue("uf", body.uf !== undefined ? sanitizeString(body.uf, 2) : undefined);
    setValue("cep", body.cep !== undefined ? sanitizeString(body.cep, 10) : undefined);
    setValue("latitude", body.latitude !== undefined ? sanitizeFloat(body.latitude) : undefined);
    setValue("longitude", body.longitude !== undefined ? sanitizeFloat(body.longitude) : undefined);
    setValue("ativo", body.ativo !== undefined ? sanitizeInt(body.ativo) : undefined);

    if (updates.length === 0) return json({ error: "Nenhum campo para atualizar" }, 400);

    updates.push("updated_at = datetime('now')");
    const sql = `UPDATE tecnicos SET ${updates.join(", ")} WHERE id = ? AND ativo = 1`;
    const stmt = db.prepare(sql).bind(...params, id);
    const result = await stmt.run();
    if (!result.success) return json({ error: "Erro ao atualizar técnico" }, 500);

    const list = await db.prepare("SELECT * FROM tecnicos WHERE id = ?").bind(id).all<Record<string, unknown>>();
    return json({ tecnico: list.results[0] ?? null });
  } catch (err) {
    console.error("[D1] update error", err);
    return json({ error: "Erro ao atualizar técnico" }, 500);
  }
}

async function handleImportTecnicos(request: Request, env: unknown): Promise<Response> {
  let rows: ImportRow[];
  try {
    rows = (await request.json()) as ImportRow[];
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return json({ error: "Envie um array com pelo menos um técnico" }, 400);
  }

  const db = getDB(env);
  if (!db) return json({ error: "D1 não disponível" }, 503);

  try {
    await ensureTecnicosTable(db);
  } catch (err) {
    console.error("[D1] ensure table error", err);
    return json({ error: "Erro ao criar tabela" }, 500);
  }

  // Pre-validate all rows
  type Prepared = {
    nome: string;
    telefone: string;
    endereco: string;
    numero: string;
    bairro: string;
    cidade: string;
    ufStr: string;
    cep: string;
    equipStr: string;
    latitude: number | null;
    longitude: number | null;
    identificador: string;
  };
  const valid: Prepared[] = [];
  const erros: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const idx = i + 1;

    if (!row.nome || typeof row.nome !== "string" || !row.nome.trim()) {
      erros.push(`Linha ${idx}: nome é obrigatório`);
      continue;
    }

    const nome = normalizeNomeTelefone(sanitizeString(row.nome, 300));
    const telefone = sanitizeString(row.telefone, 50);
    const identificador = `${nome} / ${telefone || "(sem telefone)"}`;

    let latitude = sanitizeFloat(row.latitude);
    let longitude = sanitizeFloat(row.longitude);

    // Geocode address via Photon if no coordinates provided
    if ((latitude === null || longitude === null) && row.endereco && typeof row.endereco === "string" && row.endereco.trim()) {
      const geoQuery = `${row.endereco}, ${row.cidade || ""}, ${row.uf || ""}, Brasil`
        .replace(/\s+/g, " ")
        .trim()
        .replace(/,$/, "");
      const coord = await geocodeAddress(geoQuery);
      if (coord) {
        latitude = coord.lat;
        longitude = coord.lng;
      }
    }

    valid.push({
      nome,
      telefone,
      endereco: sanitizeString(row.endereco, 500),
      numero: sanitizeString(row.numero, 30),
      bairro: sanitizeString(row.bairro, 200),
      cidade: sanitizeString(row.cidade, 200),
      ufStr: sanitizeString(row.uf, 2),
      cep: sanitizeString(row.cep, 10),
      equipStr: sanitizeString(row.equipamentos, 500),
      latitude,
      longitude,
      identificador,
    });
  }

  if (valid.length === 0) {
    return json({ inseridos: 0, atualizados: 0, ignorados: 0, erros });
  }

  // Execute all operations inside a single transaction
  let inseridos = 0;
  let atualizados = 0;
  let ignorados = 0;

  try {
    await db.exec("BEGIN TRANSACTION");

    for (const p of valid) {
      const existing = await db.prepare(
        "SELECT id, endereco, numero, bairro, cidade, uf, cep, latitude, longitude, equipamentos FROM tecnicos WHERE nome = ? AND telefone = ?",
      ).bind(p.nome, p.telefone).all<Record<string, unknown>>();

      if (existing.results.length > 0) {
        const cur = existing.results[0];
        const same =
          (cur.endereco ?? "") === p.endereco &&
          (cur.numero ?? "") === p.numero &&
          (cur.bairro ?? "") === p.bairro &&
          (cur.cidade ?? "") === p.cidade &&
          (cur.uf ?? "") === p.ufStr &&
          (cur.cep ?? "") === p.cep &&
          (cur.latitude ?? null) === p.latitude &&
          (cur.longitude ?? null) === p.longitude &&
          (cur.equipamentos ?? "") === p.equipStr;

        if (same) {
          ignorados++;
        } else {
          await db.prepare(`
            UPDATE tecnicos SET
              endereco = ?, numero = ?, bairro = ?, cidade = ?, uf = ?, cep = ?,
              latitude = ?, longitude = ?, equipamentos = ?, updated_at = datetime('now')
            WHERE id = ?
          `).bind(p.endereco, p.numero, p.bairro, p.cidade, p.ufStr, p.cep, p.latitude, p.longitude, p.equipStr, cur.id).run();
          atualizados++;
        }
      } else {
        await db.prepare(`
          INSERT INTO tecnicos (nome, telefone, endereco, numero, bairro, cidade, uf, cep, latitude, longitude, equipamentos)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(p.nome, p.telefone, p.endereco, p.numero, p.bairro, p.cidade, p.ufStr, p.cep, p.latitude, p.longitude, p.equipStr).run();
        inseridos++;
      }
    }

    await db.exec("COMMIT");
  } catch (err) {
    await db.exec("ROLLBACK");
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[D1] import transaction error", msg);
    erros.push(`Erro na transação: ${msg}. Nenhum registro foi salvo.`);
    return json({ inseridos: 0, atualizados: 0, ignorados: 0, erros });
  }

  return json({ inseridos, atualizados, ignorados, erros });
}

async function handleDeleteTecnico(request: Request, env: unknown): Promise<Response> {
  const url = new URL(request.url);
  const idStr = url.pathname.split("/").pop() || "";
  const id = sanitizeInt(idStr);
  if (id === null) return json({ error: "id inválido" }, 400);

  const db = getDB(env);
  if (!db) return json({ error: "D1 não disponível" }, 503);
  try {
    await ensureTecnicosTable(db);
    const stmt = db.prepare(
      "UPDATE tecnicos SET ativo = 0, updated_at = datetime('now') WHERE id = ?",
    ).bind(id);
    const result = await stmt.run();
    if (!result.success) return json({ error: "Erro ao desativar técnico" }, 500);
    return json({ success: true });
  } catch (err) {
    console.error("[D1] delete error", err);
    return json({ error: "Erro ao desativar técnico" }, 500);
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
        return await handleRouteDistance(request);
      }
      if (request.method === "POST" && url.pathname === "/api/geocode-fixed-address") {
        return await handleFixedAddressGeocode(request);
      }
      if (request.method === "POST" && url.pathname === "/api/geocode-reverse") {
        return await handleReverseGeocode(request);
      }

      // D1 tecnicos CRUD
      if (url.pathname === "/api/tecnicos" || url.pathname.startsWith("/api/tecnicos/")) {
        if (request.method === "POST" && url.pathname === "/api/tecnicos/import") {
          return await handleImportTecnicos(request, env);
        }
        if (request.method === "GET" && url.pathname === "/api/tecnicos") {
          return await handleListTecnicos(env);
        }
        if (request.method === "POST" && url.pathname === "/api/tecnicos") {
          return await handleCreateTecnico(request, env);
        }
        if (request.method === "PUT" && url.pathname.startsWith("/api/tecnicos/")) {
          return await handleUpdateTecnico(request, env);
        }
        if (request.method === "DELETE" && url.pathname.startsWith("/api/tecnicos/")) {
          return await handleDeleteTecnico(request, env);
        }
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
