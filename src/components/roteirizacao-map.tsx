import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ConfirmedService, Technician } from "@/types";
import { brCityCoords } from "@/services/br-city-coords";
import {
  buildGoogleMapsRouteUrl,
  geocodeFullAddress,
  normalize,
  extractCity,
  getServiceDestination,
  type RouteDistance,
} from "@/services/distance";
import type { EquipmentBalance } from "@/services/equipment-balance";
import { parsePeopleFromResponsibleText, type PersonInfo } from "@/utils/parse-responsible-contact";
import { associatePhonesToPeople } from "@/utils/extract-phones";
import { buildWhatsAppUrl } from "@/utils/whatsapp-url";
import { getGreetingByCurrentTime } from "@/utils/greeting";
import { normalizeText, stripFormatMarkers } from "@/utils/normalize-text";
import { equipmentLabel } from "@/utils/normalize-equipment";
import { findFixedTechnicianLocation } from "@/services/seed-data";
import { GripVertical, Search, X } from "lucide-react";

const STATE_REGION: Record<string, string> = {
  AC: "Norte",
  AP: "Norte",
  AM: "Norte",
  PA: "Norte",
  RO: "Norte",
  RR: "Norte",
  TO: "Norte",
  AL: "Nordeste",
  BA: "Nordeste",
  CE: "Nordeste",
  MA: "Nordeste",
  PB: "Nordeste",
  PE: "Nordeste",
  PI: "Nordeste",
  RN: "Nordeste",
  SE: "Nordeste",
  DF: "Centro-Oeste",
  GO: "Centro-Oeste",
  MT: "Centro-Oeste",
  MS: "Centro-Oeste",
  ES: "Sudeste",
  MG: "Sudeste",
  RJ: "Sudeste",
  SP: "Sudeste",
  PR: "Sul",
  RS: "Sul",
  SC: "Sul",
};

const STATUS_ZOOM = 7;
const REGION_COLORS: Record<string, string> = {
  Norte: "#2E7D9E",
  Nordeste: "#C0723C",
  "Centro-Oeste": "#8A7A3A",
  Sudeste: "#3D8F53",
  Sul: "#7A4F9E",
};

interface Props {
  technicians: Technician[];
  clients: ConfirmedService[];
  balances?: Map<string, EquipmentBalance>;
  routesByTech?: Record<string, Record<string, RouteDistance | null>>;
}

interface Point {
  lat: number;
  lng: number;
  label: string;
  type: "tech" | "client";
  details: string;
  city: string;
  state: string;
  address?: string;
  extra?: string;
  s8Eco?: number;
  g5Plus?: number;
  techId?: string;
  clientId?: string;
  service?: ConfirmedService;
}

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

function resolveCoords(
  city: string,
  state: string,
  destQuery?: string,
): { lat: number; lng: number } | null {
  const normState = (state || "").toLocaleLowerCase("pt-BR");
  const normCity = normalize(city?.toLocaleLowerCase("pt-BR") || "");
  // 1. Try exact city+state match (works when cityDetected is populated)
  if (normCity && normState) {
    const key = `${normCity}, ${normState}`;
    const c = brCityCoords[key];
    if (c) return c;
  }
  // 2. Try extractCity on the full destination query (same logic as geocodeAddress)
  if (destQuery) {
    const extractedKey = extractCity(destQuery);
    const c = brCityCoords[extractedKey];
    if (c) return c;
    const parts = extractedKey.split(",").map((s) => s.trim());
    const fallbackState = parts[1];
    if (fallbackState) {
      const capitalKey = STATE_CAPITAL[fallbackState];
      if (capitalKey) return brCityCoords[capitalKey] ?? null;
    }
  }
  // 3. Fallback to state capital
  if (normState) {
    const capitalKey = STATE_CAPITAL[normState];
    if (capitalKey) return brCityCoords[capitalKey] ?? null;
  }
  return null;
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
  return text.replace(/[&<>"']/g, (c) => map[c] || c);
}

function getStatusColor(status: string): string {
  if (status === "AGENDAR") return "#f97316";
  if (status === "AGENDANDO") return "#000000";
  if (status === "AGENDADO") return "#2563eb";
  return "";
}

type MapSearchResult =
  | { kind: "tech"; technician: Technician }
  | { kind: "client"; service: ConfirmedService }
  | { kind: "clientPerson"; name: string; recordIds: string[] }
  | { kind: "address"; address: string; recordIds: string[] }
  | { kind: "geocode"; address: string; lat: number; lng: number };

function findClientPeople(clients: ConfirmedService[], query: string): MapSearchResult[] {
  const people = new Map<string, { name: string; recordIds: string[] }>();
  for (const service of clients) {
    for (const person of parsePeopleFromResponsibleText(service.responsibleOriginal).people) {
      // A busca por cliente deve considerar somente quem consta como
      // responsável principal pelo veículo, e não gestores ou contatos extras.
      if (person.role !== "primary") continue;
      const normalizedName = normalizeText(person.fullName);
      if (!normalizedName.includes(query)) continue;
      const existing = people.get(normalizedName);
      if (existing) {
        if (!existing.recordIds.includes(service.id)) existing.recordIds.push(service.id);
      } else {
        people.set(normalizedName, { name: person.fullName, recordIds: [service.id] });
      }
    }
  }
  return [...people.values()]
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    .slice(0, 8)
    .map((person) => ({ kind: "clientPerson" as const, ...person }));
}

/** Busca por endereço: agrupa os serviços que compartilham o mesmo endereço. */
function findAddressResults(clients: ConfirmedService[], query: string): MapSearchResult[] {
  const addresses = new Map<string, { address: string; recordIds: string[] }>();
  for (const service of clients) {
    const address = normalizeText(service.fullAddress || "").trim();
    if (!address || !address.includes(query)) continue;
    const existing = addresses.get(address);
    if (existing) {
      if (!existing.recordIds.includes(service.id)) existing.recordIds.push(service.id);
    } else {
      addresses.set(address, { address: service.fullAddress, recordIds: [service.id] });
    }
  }
  return [...addresses.values()]
    .sort((a, b) => a.address.localeCompare(b.address, "pt-BR"))
    .slice(0, 8)
    .map((entry) => ({ kind: "address" as const, ...entry }));
}

type GeocodeSearchStatus =
  | { status: "idle" }
  | { status: "loading"; address: string }
  | { status: "found"; address: string; lat: number; lng: number }
  | { status: "notfound"; address: string };

/**
 * Geocodifica qualquer endereço digitado (mesmo sem cliente no mapa) com
 * debounce, via endpoint do servidor (Photon/komoot). Expõe
 * estados de carregamento e "não encontrado" para feedback na lista.
 */
function useDebouncedGeocode(query: string): GeocodeSearchStatus {
  const [state, setState] = useState<GeocodeSearchStatus>({ status: "idle" });
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setState({ status: "idle" });
      return;
    }
    setState({ status: "loading", address: trimmed });
    let cancelled = false;
    const timer = setTimeout(async () => {
      const coords = await geocodeFullAddress(trimmed);
      if (cancelled) return;
      setState(
        coords
          ? { status: "found", address: trimmed, lat: coords.lat, lng: coords.lng }
          : { status: "notfound", address: trimmed },
      );
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);
  return state;
}

function getAssociatedTechnicianText(service: ConfirmedService): string {
  return (service.technicianOriginal || "")
    .replace(/\u200BFORMAT:\w+\u200B|FORMAT:\w+/g, "")
    .replace(/^confirmar\s+se\s+[ée]?\s*mais\s+perto\s+ap[óo]s\s+ter\s+endere[cç]o\s+/i, "")
    .trim();
}

function getAssociatedTechnician(service: ConfirmedService, technicians: Technician[]): Technician | null {
  const rawText = getAssociatedTechnicianText(service);
  const rawName = rawText
    .replace(/\s*[/|]\s*\(?\d[\d\s().-]*\d\)?(?:\s*\([^)]*\))?\s*$/, "")
    .trim();
  // Use the cleaned text from the imported row first. technicianNormalized can
  // contain an appended phone number from the source spreadsheet, which must
  // not be part of the name comparison.
  const target = normalizeText(rawName || service.technicianNormalized);
  if (!target) return null;

  const exact = technicians.find((technician) => normalizeText(technician.nameOriginal) === target);
  if (exact) return exact;

  const words = target.split(" ").filter(Boolean);
  if (words.length < 2) return null;
  const matches = technicians.filter((technician) => {
    const candidate = normalizeText(technician.nameOriginal);
    return candidate.includes(target) || target.includes(candidate);
  });
  return matches.length === 1 ? matches[0] : null;
}

interface AssociatedTechnicianContact {
  name: string;
  phone: string;
}

function getAssociatedTechnicianContact(
  service: ConfirmedService,
  technicians: Technician[],
): AssociatedTechnicianContact | null {
  const technician = getAssociatedTechnician(service, technicians);
  const rawText = getAssociatedTechnicianText(service);
  const embeddedPhone = rawText.match(/(?:\+?55[\s.-]*)?\(?\d{2}\)?[\s.-]*9?\s*\d{4,5}[\s.-]*\d{4}/)?.[0];
  const phone = technician?.phoneNormalized || technician?.phoneOriginal || technician?.allPhones?.[0] || embeddedPhone;
  if (!phone) return null;

  const nameFromRow = rawText
    .replace(/(?:\+?55[\s.-]*)?\(?\d{2}\)?[\s.-]*9?\s*\d{4,5}[\s.-]*\d{4}/, "")
    .replace(/[|/()-]+$/g, "")
    .trim();
  return {
    name: technician?.nameOriginal || nameFromRow,
    phone,
  };
}

function buildPlatePopupHtml(service: ConfirmedService, associatedTechnician?: AssociatedTechnicianContact | null): string {
  const parsed = parsePeopleFromResponsibleText(service.responsibleOriginal);
  const phones = associatePhonesToPeople(
    service.phoneOriginal || "",
    parsed.people.length,
    parsed.people.findIndex((p) => p.role === "manager"),
    parsed.people
      .map((p, i) => (p.role === "vehicle_holder" ? i : -1))
      .filter((i) => i >= 0),
  );

  const greeting = getGreetingByCurrentTime();

  const wppSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H8l-4 2 1.5-4.5A8.5 8.5 0 1 1 21 11.5z"/></svg>';

  let html = `<div style="font-size:13px;line-height:1.6;min-width:240px;font-family:Arial,sans-serif;">`;

  html += `<div style="font-weight:700;font-size:14px;margin-bottom:4px;">Placa: ${escapeHtml(service.plateOriginal || "")}</div>`;

  if (parsed.people.length > 0) {
    html += `<div><strong>Respons\u00e1vel:</strong> ${escapeHtml(parsed.people[0].fullName)}</div>`;
  }

  const extraPeople = parsed.people.slice(1);
  for (const p of extraPeople) {
    if (p.role === "vehicle_holder") {
      html += `<div style="color:#6b7280;font-size:12px;"><em>est\u00e1 com ${escapeHtml(p.fullName)}</em></div>`;
    } else if (p.role === "manager") {
      html += `<div style="color:#6b7280;font-size:12px;"><em>Gestor ${escapeHtml(p.fullName)}</em></div>`;
    } else {
      html += `<div style="color:#6b7280;font-size:12px;"><em>${escapeHtml(p.fullName)}</em></div>`;
    }
  }

  if (service.fullAddress) {
    html += `<div><strong>Endere\u00e7o:</strong> ${escapeHtml(service.fullAddress)}</div>`;
  }

  html += `<div><strong>Equipamento:</strong> ${escapeHtml(equipmentLabel(service.equipmentNormalized))}</div>`;

  const dataHora = service.dataHora ? service.dataHora : "";
  if (dataHora) {
    html += `<div><strong>Data/Hora:</strong> ${escapeHtml(dataHora)}</div>`;
  }

  const status = service.serviceStatus || "";
  html += `<div><strong>Status:</strong> ${escapeHtml(status || "-")}</div>`;

  let hasAnyUrl = false;
  html += `<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">`;

  for (let i = 0; i < parsed.people.length; i++) {
    const person = parsed.people[i];
    const phoneInfo = phones[i];
    if (!phoneInfo || !phoneInfo.phone) continue;

    const shortName = person.firstName || person.fullName.split(" ")[0] || "Contato";
    const msg = `Ol\u00e1, ${greeting} ${shortName}!`;
    const url = buildWhatsAppUrl(phoneInfo.phone, msg);
    if (!url) continue;
    hasAnyUrl = true;

    const isVehicleHolder = person.role === "vehicle_holder" && i > 0;
    const bgColor = isVehicleHolder ? "#dc2626" : "#25D366";
    const displayName = isVehicleHolder ? `est\u00e1 com ${shortName}` : shortName;
    html += `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:${bgColor};color:white;text-decoration:none;border-radius:4px;font-size:12px;font-weight:600;">${wppSvg} ${escapeHtml(displayName)}</a>`;
  }

  const isFinalized = normalizeText(service.serviceStatus || service.serviceStatusOriginal) === "FINALIZADO";
  const technicianUrl = !isFinalized && associatedTechnician?.phone
    ? buildWhatsAppUrl(associatedTechnician.phone, `Olá, ${greeting} ${associatedTechnician.name.split(" ")[0] || ""}!`)
    : null;
  if (technicianUrl && associatedTechnician) {
    const technicianName = stripFormatMarkers(associatedTechnician.name)
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .join(" ");
    html += `<a href="${escapeHtml(technicianUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:#0f766e;color:white;text-decoration:none;border-radius:4px;font-size:12px;font-weight:600;">${wppSvg} Técnico ${escapeHtml(technicianName)}</a>`;
  }

  if (!hasAnyUrl && service.phoneOriginal) {
    html += `<span style="font-size:11px;color:#9ca3af;">Telefone n\u00e3o dispon\u00edvel</span>`;
  }

  html += `</div></div>`;

  return html;
}

export function RoteirizacaoMap({
  technicians,
  clients,
  balances,
  routesByTech,
}: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [fixedTechCoords, setFixedTechCoords] = useState<Record<string, { lat: number; lng: number }>>({});

  useEffect(() => {
    if (!document.querySelector("#leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }
    setReady(true);
  }, []);

  const { points, unresolvedClients, unresolvedTechs } = useMemo(() => {
    const pts: Point[] = [];
    const unresolved: string[] = [];
    const unresolvedT: string[] = [];
    const techCount = { total: technicians.length, resolved: 0 };
    for (const t of technicians) {
      const fixedLocation = findFixedTechnicianLocation(t);
      // Technicians are never placed at a city centroid or at a client's
      // location. A marker is shown only for the fixed registered address.
      const coords = (t.addressLat != null && t.addressLng != null)
        ? { lat: t.addressLat, lng: t.addressLng }
        : (fixedLocation?.lat != null && fixedLocation?.lng != null)
          ? { lat: fixedLocation.lat, lng: fixedLocation.lng }
        : fixedTechCoords[t.id];
      if (coords) {
        const bal = balances?.get(t.id);
        const extraLines: string[] = [];
        if (bal) {
          if (bal.inventory.s8Eco > 0 || bal.inventory.g5Plus > 0) {
            extraLines.push(
              `Estoque: ${bal.inventory.s8Eco} S8 ECO${bal.inventory.g5Plus > 0 ? ` + ${bal.inventory.g5Plus} G5` : ""}`,
            );
          }
          if (bal.used.s8Eco > 0 || bal.used.g5Plus > 0) {
            extraLines.push(
              `Usados: ${bal.used.s8Eco} S8 ECO${bal.used.g5Plus > 0 ? ` + ${bal.used.g5Plus} G5` : ""}`,
            );
          }
          if (bal.available.s8Eco > 0 || bal.available.g5Plus > 0) {
            extraLines.push(
              `Disponível: ${bal.available.s8Eco} S8 ECO${bal.available.g5Plus > 0 ? ` + ${bal.available.g5Plus} G5` : ""}`,
            );
          } else if (bal.inventory.s8Eco > 0 || bal.inventory.g5Plus > 0) {
            extraLines.push("Sem saldo disponível");
          }
        }
        const s8 = bal?.inventory.s8Eco ?? 0;
        const g5 = bal?.inventory.g5Plus ?? 0;
        const nameWords = stripFormatMarkers(t.nameOriginal || t.firstName || "").split(" ").filter(Boolean);
        const shortName = nameWords.slice(0, 2).join(" ");
        pts.push({
          ...coords,
          label: shortName || t.firstName || t.nameOriginal,
          type: "tech",
          details: `${t.cityOriginal || ""}/${t.state || ""}`,
          city: t.cityOriginal || "",
          state: t.state || "",
          address: t.address || fixedLocation?.address,
          extra: extraLines.join("<br/>"),
          s8Eco: s8,
          g5Plus: g5,
          techId: t.id,
        });
        techCount.resolved++;
      } else {
        unresolvedT.push(
          `${t.nameOriginal || "?"} (cidade: "${t.cityOriginal}", estado: "${t.state}")`,
        );
      }
    }
    const clientCount = { total: clients.length, resolved: 0 };
    for (const c of clients) {
      const destQuery = getServiceDestination(c);
      const coords = resolveCoords(c.cityDetected || "", c.stateDetected || "", destQuery);
      if (coords) {
        const extraLines: string[] = [];
        if (c.technicianOriginal) extraLines.push(`Técnico: ${c.technicianOriginal}`);
        pts.push({
          ...coords,
          label: c.responsibleOriginal,
          type: "client",
          details: `${c.cityDetected || ""}/${c.stateDetected || ""}`,
          city: c.cityDetected || "",
          state: c.stateDetected || "",
          extra: extraLines.join("<br/>"),
          clientId: c.id,
          service: c,
        });
        clientCount.resolved++;
      } else {
        console.warn("[MAPA] Cliente sem coordenadas", {
          nome: c.responsibleOriginal,
          endereco: c.fullAddress,
          cidade: c.cityDetected,
          estado: c.stateDetected,
          destQuery,
        });
        const addr = (destQuery || "").slice(0, 80);
        unresolved.push(`${c.responsibleOriginal || "?"} (${addr})`);
      }
    }

    console.log("[MAPA] Resumo pontos", { techCount, clientCount, totalPontos: pts.length });
    if (pts.length > 0) {
      console.log(
        "[MAPA] Pontos:",
        pts.map((p) => `${p.type}:${p.label} @ ${p.lat},${p.lng} [${p.city}/${p.state}]`),
      );
    }
    if (unresolvedT.length > 0) {
      console.warn("[MAPA] Técnicos sem coordenadas:", unresolvedT);
    }
    return { points: pts, unresolvedClients: unresolved, unresolvedTechs: unresolvedT };
  }, [technicians, clients, balances, fixedTechCoords]);

  // Resolve only full, fixed technician addresses that were supplied in the
  // register. Results are kept against the technician id, so equal first names
  // can never share a marker.
  useEffect(() => {
    let cancelled = false;
    const pending = technicians.filter((t) => {
      const fixed = findFixedTechnicianLocation(t);
      return Boolean(t.address || fixed?.address) &&
        t.addressLat == null && t.addressLng == null &&
        fixed?.lat == null && fixed?.lng == null &&
        !fixedTechCoords[t.id];
    });
    if (!pending.length) return;

    async function resolveFixedAddresses() {
      for (const technician of pending) {
        const address = technician.address || findFixedTechnicianLocation(technician)?.address;
        if (!address) continue;
        const coords = await geocodeFullAddress(address);
        if (cancelled || !coords) continue;
        setFixedTechCoords((current) =>
          current[technician.id] ? current : { ...current, [technician.id]: coords },
        );
      }
    }
    void resolveFixedAddresses();
    return () => { cancelled = true; };
  }, [technicians, fixedTechCoords]);

  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const stateLayerRef = useRef<L.GeoJSON | null>(null);
  const techMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const clientMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leafletRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const [renderTick, setRenderTick] = useState(0);
  const [clientSearchActive, setClientSearchActive] = useState(false);
  const [clientFilterIds, setClientFilterIds] = useState<Set<string>>(new Set());
  const [shortcutSearchOpen, setShortcutSearchOpen] = useState(false);
  const [shortcutSearchQuery, setShortcutSearchQuery] = useState("");
  const shortcutSearchRef = useRef<HTMLInputElement>(null);
  const shortcutDialogRef = useRef<HTMLDivElement>(null);
  const [shortcutDialogPosition, setShortcutDialogPosition] = useState<{ x: number; y: number } | null>(null);
  const [topSearchOpen, setTopSearchOpen] = useState(false);
  const [topSearchQuery, setTopSearchQuery] = useState("");
  const [addressPin, setAddressPin] = useState<{ lat: number; lng: number; address: string } | null>(null);
  const pendingZoomRef = useRef<{ latlngs: { lat: number; lng: number }[]; zoom?: number } | null>(null);
  const preserveViewportOnNextMarkerUpdateRef = useRef(false);
  const searchAreaRef = useRef<HTMLDivElement>(null);
  const [selectedTechId, setSelectedTechId] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const selectedTechIdRef = useRef<string | null>(null);
  const routeLinesRef = useRef<L.Polyline[]>([]);
  const [techDestAddr, setTechDestAddr] = useState("");
  const techDestInputRef = useRef<HTMLInputElement>(null);

  const selectedTech = useMemo(
    () => technicians.find((t) => t.id === selectedTechId) || null,
    [technicians, selectedTechId],
  );
  const selectedClient = useMemo(
    () => clients.find((client) => client.id === selectedClientId) || null,
    [clients, selectedClientId],
  );

  const selectedRouteUrl = useMemo(
    () => (selectedTech && selectedClient ? buildGoogleMapsRouteUrl(selectedTech, selectedClient) : ""),
    [selectedTech, selectedClient],
  );

  function openSelectedClientRoute() {
    if (!selectedRouteUrl) return;
    window.open(selectedRouteUrl, "_blank", "noopener,noreferrer");
    // The action is complete: close both map controls. They are shown again
    // only after the user starts a new technician → client selection.
    setSelectedClientId(null);
    setSelectedTechId(null);
    setTechDestAddr("");
    removeRoute();
  }

  function handleTechRoute() {
    if (!selectedTech || !techDestAddr.trim()) return;
    // Usa o endereço real do técnico (já enriquecido pelo applySeedAddresses em roteirizacao.tsx)
    // Ignora endereços marcados como inválidos
    const seedAddr = selectedTech.address;
    const isValidAddr = seedAddr &&
      !seedAddr.includes("não localizado") &&
      !seedAddr.includes("não informado");
    const origin = isValidAddr
      ? seedAddr!
      : (selectedTech.addressLat && selectedTech.addressLng
        ? `${selectedTech.addressLat},${selectedTech.addressLng}`
        : "");
    console.log("[MAPA][BUSCA] handleTechRoute", {
      tecnico: selectedTech.nameOriginal,
      enderecoSeed: seedAddr || "(sem endereço)",
      enderecoUsado: origin || "(não encontrado — faltando coords)",
      destino: techDestAddr,
    });
    if (!origin) {
      console.warn("[MAPA][BUSCA] Técnico sem endereço e sem coordenadas, não é possível abrir rota.");
      return;
    }
    const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(techDestAddr.trim())}`;
    window.open(url, "_blank");
    setSelectedTechId(null);
    setTechDestAddr("");
  }

  useEffect(() => { selectedTechIdRef.current = selectedTechId; }, [selectedTechId]);

  function removeRoute() {
    for (const line of routeLinesRef.current) line.remove();
    routeLinesRef.current = [];
  }

  // Desenha a rota real entre técnico e cliente selecionados usando o OSRM
  // (Open Source Routing Machine, servidor público e gratuito, sem chave).
  useEffect(() => {
    if (!mapReady || !selectedTech || !selectedClient) return;
    const map = mapInstanceRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;

    const start = (selectedTech.addressLat != null && selectedTech.addressLng != null)
      ? { lat: selectedTech.addressLat, lng: selectedTech.addressLng }
      : points.find((p) => p.type === "tech" && p.techId === selectedTech.id) || null;
    const end = points.find((p) => p.type === "client" && p.clientId === selectedClient.id) || null;
    if (!start || !end) return;

    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    (async () => {
      // OSRM recebe [longitude, latitude] separados por ';'.
      const url = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok || cancelled) return;
        const data = (await response.json()) as {
          routes?: { geometry?: { coordinates?: [number, number][] } }[];
        };
        const coordinates = data.routes?.[0]?.geometry?.coordinates;
        if (cancelled || !coordinates || coordinates.length === 0) return;
        // OSRM retorna [longitude, latitude]; o Leaflet espera [latitude, longitude].
        const latLngs: [number, number][] = coordinates.map(([lng, lat]) => [lat, lng]);
        removeRoute();
        if (cancelled) return;
        const line = L.polyline(latLngs, { color: "#2A82C5", weight: 5, opacity: 0.9 }).addTo(map);
        routeLinesRef.current.push(line);
        map.fitBounds(line.getBounds(), { padding: [40, 40], maxZoom: 14 });
      } catch (error) {
        console.warn("[MAPA] Erro ao buscar rota no OSRM:", error);
      } finally {
        clearTimeout(timer);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
      removeRoute();
    };
  }, [mapReady, selectedTech, selectedClient, points]);

  const visiblePoints = useMemo(() => {
    if (!clientSearchActive || clientFilterIds.size === 0) return points;
    return points.filter((p) => p.type === "tech" || (p.type === "client" && p.clientId && clientFilterIds.has(p.clientId)));
  }, [points, clientSearchActive, clientFilterIds]);

  console.log(
    "[MAPA] Render (techs=" +
      technicians.length +
      ", clients=" +
      clients.length +
      ", ready=" +
      (mapReady ? "S" : "N") +
      ", tick=" +
      renderTick +
      ")",
  );

  // Initialize the map once (on mount)
  useEffect(() => {
    if (!ready || !mapRef.current || mapInstanceRef.current) return;

    let cancelled = false;

    async function initMap() {
      const L = (await import("leaflet")).default;
      if (cancelled || !mapRef.current) return;

      const map = L.map(mapRef.current, {
        center: [-14.235, -51.9253],
        zoom: 4,
        zoomControl: false,
        maxZoom: 19,
      });
      map.whenReady(() => map.invalidateSize());

      const stadiaAttribution =
        '&copy; <a href="https://www.stadiamaps.com/" target="_blank" rel="noopener">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/about" target="_blank" rel="noopener">&copy; OpenStreetMap contributors</a>';
      const stadiaApiKey = ((import.meta.env?.VITE_STADIA_MAPS_API_KEY as string | undefined) || "").trim();
      const stadiaTileUrl = (style: "alidade_smooth" | "alidade_smooth_dark") => {
        const base = `https://tiles.stadiamaps.com/tiles/${style}/{z}/{x}/{y}{r}.png`;
        return stadiaApiKey ? `${base}?api_key=${encodeURIComponent(stadiaApiKey)}` : base;
      };
      const stadiaLight = L.tileLayer(stadiaTileUrl("alidade_smooth"), {
        attribution: stadiaAttribution,
        maxZoom: 20,
      });
      const stadiaDark = L.tileLayer(stadiaTileUrl("alidade_smooth_dark"), {
        attribution: stadiaAttribution,
        maxZoom: 20,
      });
      const satellite = L.layerGroup([
        L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
          attribution: '&copy; <a href="https://esri.com">Esri</a>',
          maxZoom: 19,
        }),
        L.tileLayer("https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png", {
          attribution: '&copy; <a href="https://carto.com">CARTO</a>',
          maxZoom: 19,
        }),
      ]);
      stadiaLight.addTo(map);

      L.control.layers(
        { "Mapa (Claro)": stadiaLight, "Mapa (Escuro)": stadiaDark, "Satélite": satellite },
        {},
        { position: "bottomleft" },
      ).addTo(map);

      L.control.zoom({ position: "topright" }).addTo(map);

      leafletRef.current = L;
      map.createPane("statesPane");
      const pane = map.getPane("statesPane");
      if (pane) pane.style.zIndex = "300";
      const layerGroup = L.layerGroup().addTo(map);
      markerLayerRef.current = layerGroup;
      mapInstanceRef.current = map;
      setMapReady(true);
      const onResize = () => map.invalidateSize();
      window.addEventListener("resize", onResize);
      map.on("remove", () => window.removeEventListener("resize", onResize));
    }

    initMap();

    return () => {
      cancelled = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerLayerRef.current = null;
      }
      setMapReady(false);
    };
  }, [ready]);

  // Force marker re-apply whenever data changes
  useEffect(() => {
    setRenderTick((t) => t + 1);
  }, [technicians, clients]);

  // Load Brazilian states GeoJSON for border rendering
  useEffect(() => {
    const map = mapInstanceRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;
    if (stateLayerRef.current) return;

    let cancelled = false;

    async function loadStates() {
      try {
        const res = await fetch(
          "https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/brazil-states.geojson",
        );
        if (cancelled) return;
        const data = await res.json();
        if (cancelled) return;

        const layer = L.geoJSON(data, {
          pane: "statesPane",
          interactive: false,
          style: (feature: unknown) => {
            const props =
              ((feature as Record<string, unknown>)?.properties as Record<string, string>) || {};
            const stateAbbr = (
              props.sigla ||
              props.SIGLA ||
              props.abbrev ||
              props.UF ||
              props.uf ||
              ""
            ).toUpperCase();
            const region = STATE_REGION[stateAbbr];
            const color = region ? REGION_COLORS[region] : "#777";
            return {
              color,
              weight: 2.5,
              opacity: 0.7,
              fill: false,
            };
          },
        }).addTo(map);
        stateLayerRef.current = layer;
      } catch (err) {
        console.warn("[MAPA] Erro ao carregar estados:", err);
      }
    }

    loadStates();

    return () => {
      cancelled = true;
    };
  }, [mapReady]);

  // Update markers when visiblePoints or mapReady or renderTick change (without destroying the map)
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layerGroup = markerLayerRef.current;
    const L = leafletRef.current;
    if (!map || !layerGroup || !L) return;

    // Clear existing markers
    layerGroup.clearLayers();
    techMarkersRef.current.clear();
    clientMarkersRef.current.clear();
    removeRoute();

    // A municipality coordinate can be shared by several clients. When their
    // statuses differ, a single visible badge would be ambiguous, so do not
    // render it over any of those overlapping markers.
    const statusesByCoordinate = new Map<string, Set<string>>();
    for (const point of visiblePoints) {
      if (point.type !== "client" || !point.service) continue;
      const coordinateKey = `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`;
      const statuses = statusesByCoordinate.get(coordinateKey) || new Set<string>();
      statuses.add(normalizeText(point.service.serviceStatus || point.service.serviceStatusOriginal));
      statusesByCoordinate.set(coordinateKey, statuses);
    }

    // Vários veículos podem ter a mesma coordenada de cidade. Enquanto uma
    // busca de cliente está ativa, abrimos esses marcadores em um pequeno leque
    // visual para que todos possam ser vistos e selecionados. O endereço e a
    // rota continuam usando os dados reais, sem nenhuma alteração.
    const clientMarkerPositions = new Map<string, { lat: number; lng: number }>();
    if (clientSearchActive) {
      const clusters = new Map<string, Point[]>();
      for (const point of visiblePoints) {
        if (point.type !== "client" || !point.clientId) continue;
        const key = `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`;
        const cluster = clusters.get(key) || [];
        cluster.push(point);
        clusters.set(key, cluster);
      }
      for (const cluster of clusters.values()) {
        if (cluster.length < 2) continue;
        const radius = 0.006;
        cluster.forEach((point, index) => {
          const angle = (Math.PI * 2 * index) / cluster.length;
          clientMarkerPositions.set(point.clientId!, {
            lat: point.lat + Math.sin(angle) * radius,
            lng: point.lng + Math.cos(angle) * radius,
          });
        });
      }
    }

    // Delimita visualmente os veiculos retornados pela busca. Esta camada e
    // somente visual: nao muda a coordenada real, o endereco ou a rota.
    if (clientSearchActive) {
      for (const point of visiblePoints) {
        if (point.type !== "client") continue;
        const markerPosition = point.clientId ? clientMarkerPositions.get(point.clientId) : undefined;
        const lat = markerPosition?.lat ?? point.lat;
        const lng = markerPosition?.lng ?? point.lng;
        const polygon = Array.from({ length: 11 }, (_, index) => {
          const angle = (Math.PI * 2 * index) / 11;
          // Oscilacao deterministica para produzir uma borda organica,
          // sem movimentar a demarcacao a cada atualizacao do mapa.
          const radius = 0.0072 * (0.78 + ((index * 37 + point.label.length * 11) % 29) / 100);
          return [
            lat + Math.sin(angle) * radius,
            lng + Math.cos(angle) * radius / Math.max(0.35, Math.cos((lat * Math.PI) / 180)),
          ] as [number, number];
        });
        L.polygon(polygon, {
          color: "#7c3aed",
          weight: 2,
          opacity: 0.8,
          dashArray: "8 6",
          fillColor: "#a855f7",
          fillOpacity: 0.16,
          interactive: false,
        }).addTo(layerGroup);
      }
    }

    // Pino de um endereço pesquisado (qualquer endereço, mesmo sem cliente no
    // mapa): mesma demarcação orgânica tracejada da busca de cliente.
    if (addressPin) {
      const polygon = Array.from({ length: 11 }, (_, index) => {
        const angle = (Math.PI * 2 * index) / 11;
        const radius =
          0.0072 * (0.78 + ((index * 37 + addressPin.address.length * 11) % 29) / 100);
        return [
          addressPin.lat + Math.sin(angle) * radius,
          addressPin.lng +
            (Math.cos(angle) * radius) / Math.max(0.35, Math.cos((addressPin.lat * Math.PI) / 180)),
        ] as [number, number];
      });
      L.polygon(polygon, {
        color: "#7c3aed",
        weight: 2,
        opacity: 0.8,
        dashArray: "8 6",
        fillColor: "#a855f7",
        fillOpacity: 0.16,
        interactive: false,
      }).addTo(layerGroup);

      const pinIcon = L.divIcon({
        className: "",
        html: `<div style="
          width: 22px; height: 22px;
          background: linear-gradient(145deg, #a855f7, #7c3aed);
          border: 2px solid rgba(255,255,255,0.9);
          border-radius: 50%;
          box-shadow: 0 3px 6px rgba(0,0,0,0.4);
          cursor: pointer;
        "></div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      const pinMarker = L.marker([addressPin.lat, addressPin.lng], { icon: pinIcon }).addTo(
        layerGroup,
      );
      pinMarker.bindTooltip(
        `<strong>Endereço pesquisado</strong><br/>${escapeHtml(addressPin.address)}`,
        { direction: "top", offset: [0, -12] },
      );
    }

    for (const p of visiblePoints) {
      const markerPosition = p.clientId ? clientMarkerPositions.get(p.clientId) : undefined;
      const lat = markerPosition?.lat ?? p.lat;
      const lng = markerPosition?.lng ?? p.lng;

      const isTech = p.type === "tech";
      const grad = isTech
        ? "linear-gradient(145deg, #3b82f6, #1d4ed8)"
        : "linear-gradient(145deg, #ef4444, #b91c1c)";
      const color = isTech ? "#2563eb" : "#dc2626";
      const shape = isTech ? "circle" : "square";
      const techSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`;
      const car3dSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><defs><linearGradient id="cb3d" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ef4444"/><stop offset="1" stop-color="#991b1b"/></linearGradient></defs><ellipse cx="12" cy="21" rx="9" ry="1.5" fill="rgba(0,0,0,0.12)"/><path d="M2 16c0-1 .8-1.8 1.5-2.2L7 11.5c.5-.3 1-.5 1.5-.5h7c.5 0 1 .2 1.5.5l3.5 2.3c.7.4 1.5 1.2 1.5 2.2v2H2z" fill="url(#cb3d)"/><path d="M8 12l1.5-2.2c.3-.4.7-.7 1.2-.7h2.6c.5 0 1 .3 1.2.7L16 12z" fill="#991b1b"/><path d="M9.5 12l.8-1.4c.2-.3.4-.5.7-.5h.5V12z" fill="#bfdbfe" opacity=".6"/><path d="M13 12V10h.3c.3 0 .5.2.7.5l.8 1.5z" fill="#bfdbfe" opacity=".6"/><circle cx="6" cy="18" r="2.2" fill="#1f2937"/><circle cx="6" cy="18" r="1" fill="#6b7280"/><circle cx="18" cy="18" r="2.2" fill="#1f2937"/><circle cx="18" cy="18" r="1" fill="#6b7280"/><rect x="20" y="14" width="1.5" height="1" rx=".3" fill="#fbbf24"/><rect x="2.5" y="14.5" width="1" height=".8" rx=".2" fill="#ef4444"/></svg>`;

      let nameHtml = "";
      let statusHtml = "";
      let badgeHtml = "";
      let iconW = 22,
        iconH = 22,
        ancX = 11,
        ancY = 11;
      if (isTech) {
        nameHtml = `<div style="
          font-size: 12px; font-weight: 600; white-space: nowrap;
          background: rgba(255,255,255,0.92);
          padding: 1px 5px; border-radius: 4px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.25);
          margin-bottom: 2px; line-height: 1.4;
          text-align: center;
          color: #2563eb;
        ">${p.label}</div>`;
        iconW = 140;
        // The label sits above the 22px technician icon. Anchor the bottom of
        // that icon to the geographic coordinate so the visible marker does
        // not appear displaced south of the registered address.
        iconH = 43;
        ancX = 70;
        ancY = 43;
      } else {
        iconW = 32;
        iconH = 32;
        ancX = 16;
        ancY = 32;
      }
      if (isTech && (p.s8Eco || p.g5Plus)) {
        const parts: string[] = [];
        if (p.s8Eco) parts.push(`📷${p.s8Eco}`);
        if (p.g5Plus) parts.push(`🛰️${p.g5Plus}`);
        const warn =
          (p.s8Eco !== undefined && p.s8Eco === 1) || (p.g5Plus !== undefined && p.g5Plus === 1)
            ? " ⚠️"
            : "";
        if (parts.length || warn) {
          badgeHtml = `<div style="
            font-size: 13px; white-space: nowrap;
            background: rgba(255,255,255,0.95);
            padding: 1px 5px; border-radius: 4px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.25);
            margin-top: 2px; line-height: 1.4;
            text-align: center;
          ">${parts.join(" ")}${warn}</div>`;
          iconW = 140;
          iconH = 62;
          ancX = 70;
          // Keep the coordinate pinned to the technician icon; the inventory
          // badge is only an annotation rendered below it.
          ancY = 43;
        }
      }

      const icon = L.divIcon({
        className: "",
        html: `<div style="display:flex;flex-direction:column;align-items:center;width:${iconW}px">
          ${nameHtml}
          ${statusHtml}
          ${isTech ? `<div style="
            width: 22px; height: 22px;
            background: ${grad};
            border: 2px solid rgba(255,255,255,0.9);
            border-radius: 50%;
            box-shadow: 0 3px 6px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.25);
            display: flex; align-items: center; justify-content: center;
            color: white; font-size: 11px; font-weight: 700;
            font-family: Arial, sans-serif;
            cursor: pointer;
          ">${techSvg}</div>` : car3dSvg}
          ${badgeHtml}
        </div>`,
        iconSize: [iconW, iconH],
        iconAnchor: [ancX, ancY],
      });

      const marker = L.marker([lat, lng], { icon }).addTo(layerGroup);

      if (!isTech && p.service) {
        // Imports with mapped/dynamic columns may not retain serviceStatusOriginal.
        // The normalized status remains the source of truth for the map badge.
        const statusNorm = normalizeText(p.service.serviceStatus || p.service.serviceStatusOriginal).trim();
        const coordinateKey = `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
        const uniqueStatusAtCoordinate = statusesByCoordinate.get(coordinateKey)?.size === 1;
        if (statusNorm === "AGENDAR" && uniqueStatusAtCoordinate) {
          (marker as any).__clientStatus = { text: "AGENDAR", color: "#f97316" };
        }
      }

      let tooltipHtml: string;
      if (isTech) {
        tooltipHtml = `<strong>${escapeHtml(p.label)}</strong><br/>${p.details}${p.address ? `<br/>${escapeHtml(p.address)}` : ""}<br/><em>Técnico</em>${p.extra ? `<br/>${p.extra}` : ""}`;
      } else {
        const status = p.service?.serviceStatus || "";
        const statusColor = getStatusColor(status);
        tooltipHtml = `<strong>${escapeHtml(p.label)}</strong><br/>${p.details}<br/><em>Cliente</em>`;
        if (p.service) {
          tooltipHtml += `<br/><strong>Equipamento:</strong> ${escapeHtml(equipmentLabel(p.service.equipmentNormalized))}`;
        }
        if (status && statusColor) {
          tooltipHtml += `<br/><span style="color:${statusColor};font-weight:700;font-size:13px;">${escapeHtml(status)}</span>`;
        } else if (status) {
          tooltipHtml += `<br/>${escapeHtml(status)}`;
        }
        if (p.extra) tooltipHtml += `<br/>${p.extra}`;
      }
      marker.bindTooltip(tooltipHtml, { direction: "top", offset: [0, -20] });
      if (!isTech && p.service) {
        const popupHtml = buildPlatePopupHtml(p.service, getAssociatedTechnicianContact(p.service, technicians));
        marker.bindPopup(popupHtml, { maxWidth: 320, minWidth: 260 });
        (marker as any).__popupHtml = popupHtml;
      }
      if (isTech && p.techId) {
        techMarkersRef.current.set(p.techId, marker);
        (marker as any).__techAddress = p.address;
        marker.on("click", (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e.originalEvent);
          const tid = p.techId!;
          if (selectedTechIdRef.current === tid) {
            setSelectedTechId(null);
            setSelectedClientId(null);
            removeRoute();
          } else {
            setSelectedTechId(tid);
            setSelectedClientId(null);
            removeRoute();
          }
        });
      }
      if (!isTech && p.clientId) {
        clientMarkersRef.current.set(p.clientId, marker);
        marker.on("click", () => {
          const techId = selectedTechIdRef.current;
          if (techId) {
            marker.closePopup();
            // The second click selects a destination. The user explicitly
            // chooses whether to open the generated Google Maps route below.
            setSelectedClientId(p.clientId!);
          }
        });
      }
    }

    // Apply selected tech highlight
    for (const [, marker] of techMarkersRef.current) {
      const el = marker.getElement();
      if (el) {
        if (selectedTechIdRef.current && marker === techMarkersRef.current.get(selectedTechIdRef.current)) {
          el.classList.add("tech-selected");
        } else {
          el.classList.remove("tech-selected");
        }
      }
    }

    // Debug: check actual marker count vs expected
    const actualMarkers = layerGroup.getLayers().length;
    console.log("[MAPA] Marcadores atualizados", {
      esperado: visiblePoints.length,
      noMapa: actualMarkers,
      tecnicos: visiblePoints.filter((p) => p.type === "tech").map((p) => p.label),
      clientes: visiblePoints.filter((p) => p.type === "client").map((p) => p.label),
      filtroAtivo: clientSearchActive,
      filtroIds: clientSearchActive ? [...clientFilterIds] : [],
    });

    map.invalidateSize();

    updateStatusBadges(map);

    // Handle pending zoom from client person selection
    if (pendingZoomRef.current) {
      const { latlngs, zoom } = pendingZoomRef.current;
      pendingZoomRef.current = null;
      if (latlngs.length === 1) {
        map.flyTo([latlngs[0].lat, latlngs[0].lng], zoom ?? 14, { duration: 1 });
      } else if (latlngs.length > 1) {
        const bounds = L.latLngBounds(latlngs.map((p) => [p.lat, p.lng]));
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
      }
    } else if (preserveViewportOnNextMarkerUpdateRef.current) {
      // Ao sair de uma busca, os marcadores voltam a aparecer sem deslocar o
      // usuario para o enquadramento padrao do mapa.
      preserveViewportOnNextMarkerUpdateRef.current = false;
    } else if (visiblePoints.length > 0) {
      const bounds = L.latLngBounds(visiblePoints.map((p) => [p.lat, p.lng]));
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [visiblePoints, mapReady, renderTick, addressPin]);

  const updateStatusBadges = useCallback((map: L.Map) => {
    const zoom = map.getZoom();
    for (const [, marker] of clientMarkersRef.current) {
      const st = (marker as any).__clientStatus as { text: string; color: string } | undefined;
      const el = marker.getElement();
      if (!el || !st) continue;
      const existing = el.querySelector(".client-status-badge") as HTMLElement | null;
      if (zoom >= STATUS_ZOOM) {
        if (!existing) {
          el.style.position = "relative";
          const badge = document.createElement("div");
          badge.className = "client-status-badge";
          badge.textContent = st.text;
          badge.style.cssText = `position:absolute;bottom:100%;left:50%;transform:translateX(-50%);font-size:11px;font-weight:700;white-space:nowrap;color:${st.color};background:rgba(255,255,255,0.85);padding:0 6px;border-radius:3px;line-height:1.6;box-shadow:0 1px 3px rgba(0,0,0,0.2);border:1px solid rgba(0,0,0,0.08);pointer-events:none;`;
          el.prepend(badge);
        }
      } else {
        if (existing) existing.remove();
      }
    }
  }, []);

  // Refresh marker badges on zoom
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    function refresh() {
      updateStatusBadges(map);
    }
    map.on("zoomend", refresh);
    return () => map.off("zoomend", refresh);
  }, [updateStatusBadges, mapReady]);

  // Tech inventory list with bars
  const techInventory = useMemo(() => {
    const items: { name: string; s8: number; g5: number }[] = [];
    let maxS8 = 0,
      maxG5 = 0;
    for (const t of technicians) {
      const b = balances?.get(t.id);
      const s8 = b?.inventory.s8Eco ?? 0;
      const g5 = b?.inventory.g5Plus ?? 0;
      if (s8 || g5) {
        items.push({ name: t.nameOriginal, s8, g5 });
        if (s8 > maxS8) maxS8 = s8;
        if (g5 > maxG5) maxG5 = g5;
      }
    }
    return { items, maxS8, maxG5 };
  }, [technicians, balances]);

  // Summary inventory
  const inventorySummary = useMemo(() => {
    if (!balances || balances.size === 0) return null;
    let totalS8 = 0,
      totalG5 = 0,
      usedS8 = 0,
      usedG5 = 0,
      pendS8 = 0,
      pendG5 = 0;
    for (const b of balances.values()) {
      totalS8 += b.inventory.s8Eco;
      totalG5 += b.inventory.g5Plus;
      usedS8 += b.used.s8Eco;
      usedG5 += b.used.g5Plus;
      pendS8 += b.pending.s8Eco;
      pendG5 += b.pending.g5Plus;
    }
    if (totalS8 === 0 && totalG5 === 0) return null;
    return { totalS8, totalG5, usedS8, usedG5, pendS8, pendG5 };
  }, [balances]);

  // Techs visible on the map (for search filtering)
  const visibleTechs = useMemo(() => {
    const techIdsOnMap = new Set(points.filter((p) => p.type === "tech").map((p) => p.techId));
    return technicians.filter((t) => techIdsOnMap.has(t.id));
  }, [technicians, points]);

  const shortcutGeocode = useDebouncedGeocode(shortcutSearchQuery);
  const topGeocode = useDebouncedGeocode(topSearchQuery);

  const shortcutSearchResults = useMemo<MapSearchResult[]>(() => {
    const query = normalizeText(shortcutSearchQuery);
    if (!query) return [];

    const technicianMatches = visibleTechs
      .filter((technician) => normalizeText(technician.nameOriginal).includes(query))
      .slice(0, 5)
      .map((technician) => ({ kind: "tech" as const, technician }));
    const personMatches = findClientPeople(clients, query);
    const clientMatches = clients
      .filter((service) => {
        const plate = normalizeText(service.plateOriginal || "");
        const client = normalizeText(service.responsibleOriginal || "");
        return plate.includes(query) || client.includes(query);
      })
      .slice(0, 5)
      .map((service) => ({ kind: "client" as const, service }));

    return [
      ...technicianMatches,
      ...personMatches,
      ...findAddressResults(clients, query),
      ...clientMatches,
      ...(shortcutGeocode.status === "found"
        ? [
            {
              kind: "geocode" as const,
              address: shortcutGeocode.address,
              lat: shortcutGeocode.lat,
              lng: shortcutGeocode.lng,
            },
          ]
        : []),
    ];
  }, [clients, shortcutSearchQuery, visibleTechs, shortcutGeocode]);

  const topSearchResults = useMemo<MapSearchResult[]>(() => {
    const query = normalizeText(topSearchQuery);
    if (!query) return [];
    const technicianMatches = visibleTechs
      .filter((technician) => normalizeText(technician.nameOriginal).includes(query))
      .slice(0, 5)
      .map((technician) => ({ kind: "tech" as const, technician }));
    const personMatches = findClientPeople(clients, query);
    const clientMatches = clients
      .filter((service) => normalizeText(service.plateOriginal || "").includes(query) || normalizeText(service.responsibleOriginal || "").includes(query))
      .slice(0, 5)
      .map((service) => ({ kind: "client" as const, service }));
    return [
      ...technicianMatches,
      ...personMatches,
      ...findAddressResults(clients, query),
      ...clientMatches,
      ...(topGeocode.status === "found"
        ? [
            {
              kind: "geocode" as const,
              address: topGeocode.address,
              lat: topGeocode.lat,
              lng: topGeocode.lng,
            },
          ]
        : []),
    ];
  }, [clients, topSearchQuery, visibleTechs, topGeocode]);

  const handleTechSelect = useCallback((tech: Technician) => {
    const map = mapInstanceRef.current;
    const marker = techMarkersRef.current.get(tech.id);
    const L = leafletRef.current;
    if (!map || !marker || !L) return;

    map.flyTo(marker.getLatLng(), 14, { duration: 1 });

    setTimeout(() => {
      try {
        marker.openPopup();
      } catch {
        /* ignore */
      }
    }, 300);

    const el = marker.getElement();
    if (el) {
      el.classList.add("tech-marker-highlight");
      setTimeout(() => el.classList.remove("tech-marker-highlight"), 3000);
    }
  }, []);

  const handlePlateSelect = useCallback((service: ConfirmedService) => {
    const map = mapInstanceRef.current;
    const marker = clientMarkersRef.current.get(service.id);
    const L = leafletRef.current;
    if (!map || !L) return;

    if (marker) {
      const hasAddr = (service.fullAddress || "").trim().toLowerCase();
      const invalidAddr = !hasAddr || hasAddr === "-" || hasAddr === "não informado" || hasAddr === "nao informado" || hasAddr === "sem endereço" || hasAddr === "sem endereco";

      if (!invalidAddr) {
        const popupHtml = buildPlatePopupHtml(service, getAssociatedTechnicianContact(service, technicians));
        marker.bindPopup(popupHtml, { maxWidth: 320, minWidth: 260 });
        marker.openPopup();
      }
      map.flyTo(marker.getLatLng(), 14, { duration: 1 });
      const el = marker.getElement();
      if (el) {
        el.classList.add("client-marker-highlight");
        setTimeout(() => el.classList.remove("client-marker-highlight"), 3000);
      }
      return;
    }

    const city = service.cityDetected;
    const state = service.stateDetected;
    if (city) {
      const key = `${city.toUpperCase().trim()}, ${(state || "").toUpperCase().trim()}`;
      const coords = brCityCoords[key];
      if (coords) {
        map.flyTo([coords.lat, coords.lng], 10, { duration: 1 });
      }
    }
  }, [technicians]);

  const handleClientFilter = useCallback((_personName: string, allIds: string[], validIds: string[]) => {
    setClientSearchActive(true);
    setClientFilterIds(new Set(allIds));
    setAddressPin(null);
    setRenderTick((t) => t + 1);
    const latlngs: { lat: number; lng: number }[] = [];
    for (const p of points) {
      if (p.clientId && validIds.includes(p.clientId)) {
        latlngs.push({ lat: p.lat, lng: p.lng });
      }
    }
    if (latlngs.length > 0) {
      pendingZoomRef.current = { latlngs };
    }
  }, [points]);

  const handleClearClientFilter = useCallback(() => {
    preserveViewportOnNextMarkerUpdateRef.current = true;
    setClientSearchActive(false);
    setClientFilterIds(new Set());
    setAddressPin(null);
    setRenderTick((t) => t + 1);
    pendingZoomRef.current = null;
  }, []);

  /**
   * Fixa um pino com a demarcação orgânica (mesmo estilo da busca de cliente)
   * em um endereço qualquer pesquisado, mesmo sem cliente no mapa.
   */
  const handleAddressPin = useCallback((address: string, lat: number, lng: number) => {
    setClientSearchActive(false);
    setClientFilterIds(new Set());
    setAddressPin({ address, lat, lng });
    setRenderTick((t) => t + 1);
    pendingZoomRef.current = { latlngs: [{ lat, lng }], zoom: 16 };
  }, []);

  // Um clique em uma area vazia encerra a busca de cliente e restaura o mapa
  // completo. Cliques nos icones continuam abrindo o respectivo detalhe.
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    function onMapClick(event: L.LeafletMouseEvent) {
      const target = event.originalEvent?.target as HTMLElement | null;
      if (target?.closest?.(".leaflet-marker-icon, .leaflet-popup, .leaflet-control")) return;
      setSelectedTechId(null);
      setSelectedClientId(null);
      setAddressPin(null);
      removeRoute();
      if (clientSearchActive) handleClearClientFilter();
    }
    map.on("click", onMapClick);
    return () => map.off("click", onMapClick);
  }, [clientSearchActive, handleClearClientFilter, mapReady]);

  const selectShortcutResult = useCallback((result: MapSearchResult) => {
    if (result.kind === "tech") {
      handleTechSelect(result.technician);
    } else if (result.kind === "client") {
      handlePlateSelect(result.service);
    } else if (result.kind === "address") {
      handleClientFilter(result.address, result.recordIds, result.recordIds);
    } else if (result.kind === "geocode") {
      handleAddressPin(result.address, result.lat, result.lng);
    } else {
      handleClientFilter(result.name, result.recordIds, result.recordIds);
    }
    setShortcutSearchQuery("");
    setShortcutSearchOpen(false);
  }, [handleAddressPin, handleClientFilter, handlePlateSelect, handleTechSelect]);

  const selectTopSearchResult = useCallback((result: MapSearchResult) => {
    selectShortcutResult(result);
    setTopSearchQuery("");
    setTopSearchOpen(false);
  }, [selectShortcutResult]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "l") {
        event.preventDefault();
        setShortcutSearchOpen(true);
        setShortcutDialogPosition(null);
        window.setTimeout(() => shortcutSearchRef.current?.focus(), 0);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    if (!shortcutSearchOpen) return;
    const closeWhenClickingOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (shortcutDialogRef.current?.contains(target)) return;
      setShortcutSearchOpen(false);
      setShortcutSearchQuery("");
    };
    document.addEventListener("mousedown", closeWhenClickingOutside);
    return () => document.removeEventListener("mousedown", closeWhenClickingOutside);
  }, [shortcutSearchOpen]);

  const startShortcutDialogDrag = useCallback((event: import("react").MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const mapElement = mapRef.current;
    const dialog = shortcutDialogRef.current;
    if (!mapElement || !dialog) return;

    const mapRect = mapElement.getBoundingClientRect();
    const dialogRect = dialog.getBoundingClientRect();
    const offsetX = event.clientX - dialogRect.left;
    const offsetY = event.clientY - dialogRect.top;

    const move = (moveEvent: MouseEvent) => {
      const maxX = Math.max(8, mapRect.width - dialogRect.width - 8);
      const maxY = Math.max(8, mapRect.height - dialogRect.height - 8);
      setShortcutDialogPosition({
        x: Math.max(8, Math.min(moveEvent.clientX - mapRect.left - offsetX, maxX)),
        y: Math.max(8, Math.min(moveEvent.clientY - mapRect.top - offsetY, maxY)),
      });
    };
    const stop = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", stop);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", stop);
  }, []);

  // Clear client filter when focusing on tech or plate search
  useEffect(() => {
    if (!clientSearchActive) return;
    function handleFocusIn(e: FocusEvent) {
      const target = e.target as HTMLElement;
      if (!target || !target.closest) return;
      const inTechOrPlate = target.closest('[data-search="tech"], [data-search="plate"]');
      if (inTechOrPlate) {
        handleClearClientFilter();
      }
    }
    document.addEventListener("focusin", handleFocusIn);
    return () => document.removeEventListener("focusin", handleFocusIn);
  }, [clientSearchActive, handleClearClientFilter]);

  // Layout: map on left, tech inventory on right
  return (
    <div className="flex gap-3">
      <div className="flex-1 min-w-0 space-y-1 overflow-hidden">
        <div ref={searchAreaRef} className="relative">
          <div className="relative z-[1000]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={topSearchQuery}
              onChange={(event) => { setTopSearchQuery(event.target.value); setTopSearchOpen(true); }}
              onFocus={() => setTopSearchOpen(true)}
              onKeyDown={(event) => {
                if (event.key === "Escape") { setTopSearchOpen(false); setTopSearchQuery(""); }
                if (event.key === "Enter" && topSearchResults[0]) { event.preventDefault(); selectTopSearchResult(topSearchResults[0]); }
              }}
              placeholder="Buscar técnico, cliente, placa ou endereço..."
              className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            {topSearchOpen && topSearchQuery && (
              <div className="absolute inset-x-0 top-full mt-1 max-h-64 overflow-y-auto rounded-md border bg-popover shadow-lg">
                {topSearchResults.length === 0 && topGeocode.status === "idle" ? (
                  <p className="px-3 py-2 text-sm text-muted-foreground">Nenhum resultado encontrado.</p>
                ) : topSearchResults.map((result) => (
                  <button
                    key={
                      result.kind === "tech"
                        ? `top-tech-${result.technician.id}`
                        : result.kind === "clientPerson"
                          ? `top-person-${result.name}`
                          : result.kind === "address"
                            ? `top-address-${result.address}`
                            : result.kind === "geocode"
                              ? `top-geocode-${result.address}`
                              : `top-client-${result.service.id}`
                    }
                    type="button"
                    onMouseDown={() => selectTopSearchResult(result)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-accent"
                  >
                    <span className="truncate">
                      {result.kind === "tech"
                        ? result.technician.nameOriginal
                        : result.kind === "clientPerson"
                          ? result.name
                          : result.kind === "address"
                            ? result.address
                            : result.kind === "geocode"
                              ? `Localizar: ${result.address}`
                              : result.service.responsibleOriginal}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {result.kind === "tech"
                        ? "Técnico"
                        : result.kind === "clientPerson"
                          ? `${result.recordIds.length} veículo${result.recordIds.length !== 1 ? "s" : ""}`
                          : result.kind === "address"
                            ? `${result.recordIds.length} veículo${result.recordIds.length !== 1 ? "s" : ""}`
                            : result.kind === "geocode"
                              ? "Endereço"
                              : result.service.plateOriginal || "Cliente"}
                    </span>
                  </button>
                ))}
                {topGeocode.status === "loading" && (
                  <p className="border-t px-3 py-2 text-xs text-muted-foreground">
                    Buscando endereço "{topGeocode.address}"...
                  </p>
                )}
                {topGeocode.status === "notfound" && (
                  <p className="border-t px-3 py-2 text-xs text-muted-foreground">
                    Nenhum endereço encontrado para "{topGeocode.address}".
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="relative">
          <div
            ref={mapRef}
            style={{
              width: "100%",
              height: "calc(100vh - 160px)",
              minHeight: "400px",
              borderRadius: "8px",
            }}
            className="border"
          />
          {shortcutSearchOpen && (
            <div
              ref={shortcutDialogRef}
              className="absolute z-[1200] w-[min(28rem,calc(100%-2rem))] overflow-hidden rounded-lg border bg-popover shadow-xl"
              style={shortcutDialogPosition
                ? { left: shortcutDialogPosition.x, top: shortcutDialogPosition.y }
                : { left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div
                onMouseDown={startShortcutDialogDrag}
                className="flex cursor-grab items-center gap-2 border-b bg-muted px-3 py-2 text-sm font-medium active:cursor-grabbing"
              >
                <GripVertical className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1">Localizar no mapa</span>
                <span className="text-xs font-normal text-muted-foreground">Ctrl + L</span>
                <button
                  type="button"
                  aria-label="Fechar busca"
                  className="rounded p-1 hover:bg-accent"
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={() => { setShortcutSearchOpen(false); setShortcutSearchQuery(""); }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    ref={shortcutSearchRef}
                    value={shortcutSearchQuery}
                    onChange={(event) => setShortcutSearchQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        setShortcutSearchOpen(false);
                        setShortcutSearchQuery("");
                      }
                      if (event.key === "Enter" && shortcutSearchResults[0]) {
                        event.preventDefault();
                        selectShortcutResult(shortcutSearchResults[0]);
                      }
                    }}
                    placeholder="Buscar técnico, cliente, placa ou endereço..."
                    className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                {shortcutSearchQuery && (
                  <div className="mt-2 max-h-64 overflow-y-auto rounded border">
                    {shortcutSearchResults.length === 0 && shortcutGeocode.status === "idle" ? (
                      <p className="px-3 py-2 text-sm text-muted-foreground">Nenhum resultado encontrado.</p>
                    ) : shortcutSearchResults.map((result) => (
                      <button
                        key={
                          result.kind === "tech"
                            ? `tech-${result.technician.id}`
                            : result.kind === "clientPerson"
                              ? `person-${result.name}`
                              : result.kind === "address"
                                ? `address-${result.address}`
                                : result.kind === "geocode"
                                  ? `geocode-${result.address}`
                                  : `client-${result.service.id}`
                        }
                        type="button"
                        onMouseDown={() => selectShortcutResult(result)}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-accent"
                      >
                        <span className="truncate">
                          {result.kind === "tech"
                            ? result.technician.nameOriginal
                            : result.kind === "clientPerson"
                              ? result.name
                              : result.kind === "address"
                                ? result.address
                                : result.kind === "geocode"
                                  ? `Localizar: ${result.address}`
                                  : result.service.responsibleOriginal}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {result.kind === "tech"
                            ? "Técnico"
                            : result.kind === "clientPerson"
                              ? `${result.recordIds.length} veículo${result.recordIds.length !== 1 ? "s" : ""}`
                              : result.kind === "address"
                                ? `${result.recordIds.length} veículo${result.recordIds.length !== 1 ? "s" : ""}`
                                : result.kind === "geocode"
                                  ? "Endereço"
                                  : result.service.plateOriginal || "Cliente"}
                        </span>
                      </button>
                    ))}
                    {shortcutGeocode.status === "loading" && (
                      <p className="border-t px-3 py-2 text-xs text-muted-foreground">
                        Buscando endereço "{shortcutGeocode.address}"...
                      </p>
                    )}
                    {shortcutGeocode.status === "notfound" && (
                      <p className="border-t px-3 py-2 text-xs text-muted-foreground">
                        Nenhum endereço encontrado para "{shortcutGeocode.address}".
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
          {selectedTech && (
            <div className="absolute top-3 left-3 z-[1000] flex gap-1 bg-background/95 border rounded-md p-1.5 shadow-md">
              <input
                ref={techDestInputRef}
                type="text"
                value={techDestAddr}
                onChange={(e) => setTechDestAddr(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleTechRoute(); }}
                placeholder="Endereço de destino..."
                className="w-52 h-8 px-2 text-xs rounded border border-input bg-background outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <button
                onClick={handleTechRoute}
                className="h-8 px-2.5 text-xs font-medium rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Pesquisar
              </button>
            </div>
          )}
          {selectedTech && selectedClient && (
            <div className="absolute top-14 left-3 z-[1000] max-w-md bg-background/95 border rounded-md p-2 shadow-md text-xs">
              <div className="font-medium">Rota selecionada</div>
              <div className="mt-0.5 text-muted-foreground truncate" title={selectedTech.address}>
                Origem: {selectedTech.address || "endereço fixo indisponível"}
              </div>
              <div className="text-muted-foreground truncate" title={selectedClient.fullAddress}>
                Destino: {selectedClient.fullAddress || "endereço do cliente indisponível"}
              </div>
              <div className="mt-2 flex gap-1.5">
                <button
                  type="button"
                  disabled={!selectedRouteUrl}
                  onClick={openSelectedClientRoute}
                  className="h-8 px-2.5 font-medium rounded bg-primary text-primary-foreground disabled:opacity-50"
                >
                  Abrir rota no Google Maps
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedClientId(null)}
                  className="h-8 px-2.5 rounded border hover:bg-muted"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-4 text-xs text-muted-foreground px-1 flex-wrap">
          <span className="flex items-center gap-1">
            <span
              style={{
                display: "inline-block",
                width: 12,
                height: 12,
                background: "#2563eb",
                borderRadius: "50%",
                border: "1px solid white",
              }}
            />
            Técnico
          </span>
          <span className="flex items-center gap-1">
            <span
              style={{
                display: "inline-block",
                width: 12,
                height: 12,
                background: "#dc2626",
                borderRadius: 3,
              }}
            />
            Cliente
          </span>
          {Object.entries(REGION_COLORS).map(([region, color]) => (
            <span key={region} className="flex items-center gap-1">
              <span
                style={{
                  display: "inline-block",
                  width: 16,
                  height: 3,
                  background: color,
                  borderRadius: 1,
                }}
              />
              {region}
            </span>
          ))}
          <span>{points.length} ponto(s) no mapa</span>
          <span>
            {technicians.length} técnico(s) · {clients.length} cliente(s) na lista
          </span>
        </div>
        {inventorySummary && (
          <div className="flex gap-3 text-[10px] text-muted-foreground px-1 flex-wrap border-t pt-1">
            <span className="font-semibold">Inventário total:</span>
            <span className="text-green-600">
              Disponível:{" "}
              {inventorySummary.totalS8 - inventorySummary.usedS8 - inventorySummary.pendS8} S8 ECO
              / {inventorySummary.totalG5 - inventorySummary.usedG5 - inventorySummary.pendG5} G5+
            </span>
            {inventorySummary.usedS8 > 0 && (
              <span>
                Usados: {inventorySummary.usedS8} S8 ECO / {inventorySummary.usedG5} G5+
              </span>
            )}
            {inventorySummary.pendS8 > 0 && (
              <span className="text-amber-500">
                Pendentes: {inventorySummary.pendS8} S8 ECO / {inventorySummary.pendG5} G5+
              </span>
            )}
          </div>
        )}
      </div>
      {techInventory.items.length > 0 && (
        <div
          className="w-auto min-w-48 max-w-72 shrink-0 border rounded-lg p-3 space-y-3 text-[11px] overflow-y-auto"
          style={{ maxHeight: "calc(100vh - 160px)" }}
        >
          <div className="font-semibold text-muted-foreground">Equipamentos por técnico</div>
          {techInventory.items.map((item) => {
            const MAX_DOTS = 30;
            const s8Dots = Math.min(item.s8, MAX_DOTS);
            const g5Dots = Math.min(item.g5, MAX_DOTS);
            const s8Extra = item.s8 > MAX_DOTS ? item.s8 - MAX_DOTS : 0;
            const g5Extra = item.g5 > MAX_DOTS ? item.g5 - MAX_DOTS : 0;
            const barSize = 8;
            return (
              <div key={item.name}>
                <div className="text-muted-foreground truncate mb-1">{item.name}</div>
                <div className="flex flex-wrap items-center gap-0.5">
                  {Array.from({ length: s8Dots }).map((_, i) => (
                    <div
                      key={`s8-${i}`}
                      style={{
                        width: barSize,
                        height: barSize,
                        background: "#3b82f6",
                        borderRadius: "1px",
                      }}
                      title={`S8 Eco: ${item.s8}`}
                    />
                  ))}
                  {s8Extra > 0 && (
                    <span className="text-[9px] text-muted-foreground ml-0.5">+{s8Extra}</span>
                  )}
                  {item.s8 > 0 && item.g5 > 0 && (
                    <span className="mx-0.5 text-muted-foreground/40" />
                  )}
                  {Array.from({ length: g5Dots }).map((_, i) => (
                    <div
                      key={`g5-${i}`}
                      style={{
                        width: barSize,
                        height: barSize,
                        background: "#f59e0b",
                        borderRadius: "1px",
                      }}
                      title={`G5+: ${item.g5}`}
                    />
                  ))}
                  {g5Extra > 0 && (
                    <span className="text-[9px] text-muted-foreground ml-0.5">+{g5Extra}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <style>{`
        .tech-marker-highlight .leaflet-marker-icon {
          filter: drop-shadow(0 0 8px rgba(255, 165, 0, 0.9)) !important;
          animation: tech-pulse 0.8s ease-in-out 4;
        }
        @keyframes tech-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.2); }
        }
        .client-marker-highlight .leaflet-marker-icon {
          filter: drop-shadow(0 0 8px rgba(220, 38, 38, 0.9)) !important;
          animation: client-pulse 0.8s ease-in-out 4;
        }
        @keyframes client-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.2); }
        }
        .tech-selected .leaflet-marker-icon {
          filter: drop-shadow(0 0 10px rgba(59, 130, 246, 1)) drop-shadow(0 0 20px rgba(59, 130, 246, 0.6)) !important;
          transition: filter 0.2s ease;
        }
        .route-info-tooltip {
          background: rgba(59, 130, 246, 0.95) !important;
          color: white !important;
          border: none !important;
          border-radius: 6px !important;
          padding: 4px 10px !important;
          font-size: 12px !important;
          font-weight: 600 !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.25) !important;
        }
        .route-info-tooltip .leaflet-tooltip-arrow {
          border-top-color: rgba(59, 130, 246, 0.95) !important;
        }
      `}</style>
    </div>
  );
}
