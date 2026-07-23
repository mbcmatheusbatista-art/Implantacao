import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ConfirmedService, Technician } from "@/types";
import { brCityCoords } from "@/services/br-city-coords";
import {
  normalize,
  extractCity,
  getServiceDestination,
  type RouteDistance,
} from "@/services/distance";
import type { EquipmentBalance } from "@/services/equipment-balance";
import { TechSearch } from "./roteirizacao-tech-search";
import { PlateSearch } from "./roteirizacao-plate-search";
import { ClientSearch } from "./roteirizacao-client-search";
import { parsePeopleFromResponsibleText, type PersonInfo } from "@/utils/parse-responsible-contact";
import { associatePhonesToPeople } from "@/utils/extract-phones";
import { buildWhatsAppUrl } from "@/utils/whatsapp-url";
import { getGreetingByCurrentTime } from "@/utils/greeting";
import { SEED_COORDS, SEED_ADDRESSES } from "@/services/seed-data";
import { normalizeText, stripFormatMarkers } from "@/utils/normalize-text";

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

function buildPlatePopupHtml(service: ConfirmedService): string {
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
      const seedKey = t.firstName?.toLowerCase().trim();
      const seedCoord = SEED_COORDS.get(seedKey || "");
      let coords = seedCoord
        ? seedCoord
        : (t.addressLat != null && t.addressLng != null)
          ? { lat: t.addressLat, lng: t.addressLng }
          : resolveCoords(t.cityOriginal || "", t.state || "");
      if (t.firstName?.toLowerCase().trim() === "marcos") {
        coords = { lat: -23.5583744, lng: -46.4021487 };
      }
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
          address: SEED_ADDRESSES.get(seedKey || "") || t.address,
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
  }, [technicians, clients, balances]);

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
  const pendingZoomRef = useRef<{ latlngs: { lat: number; lng: number }[] } | null>(null);
  const searchAreaRef = useRef<HTMLDivElement>(null);
  const [selectedTechId, setSelectedTechId] = useState<string | null>(null);
  const selectedTechIdRef = useRef<string | null>(null);
  const routeLinesRef = useRef<L.Polyline[]>([]);
  const [techDestAddr, setTechDestAddr] = useState("");
  const techDestInputRef = useRef<HTMLInputElement>(null);

  const selectedTech = useMemo(
    () => technicians.find((t) => t.id === selectedTechId) || null,
    [technicians, selectedTechId],
  );

  function handleTechRoute() {
    if (!selectedTech || !techDestAddr.trim()) return;
    const origin =
      selectedTech.address ||
      (selectedTech.addressLat && selectedTech.addressLng
        ? `${selectedTech.addressLat},${selectedTech.addressLng}`
        : "");
    if (!origin) return;
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
      });
      map.whenReady(() => map.invalidateSize());

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://openstreetmap.org/copyright">OSM</a>',
        maxZoom: 18,
      }).addTo(map);

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

    for (const p of visiblePoints) {
      const lat = p.lat;
      const lng = p.lng;

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
        iconH = 22;
        ancX = 70;
        ancY = 22;
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
          iconH = 56;
          ancX = 70;
          ancY = 22;
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

      if (!isTech && p.service?.serviceStatusOriginal) {
        const origNorm = normalizeText(p.service.serviceStatusOriginal).trim();
        if (origNorm === "AGENDAR") {
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
        if (status && statusColor) {
          tooltipHtml += `<br/><span style="color:${statusColor};font-weight:700;font-size:13px;">${escapeHtml(status)}</span>`;
        } else if (status) {
          tooltipHtml += `<br/>${escapeHtml(status)}`;
        }
        if (p.extra) tooltipHtml += `<br/>${p.extra}`;
      }
      marker.bindTooltip(tooltipHtml, { direction: "top", offset: [0, -20] });
      if (!isTech && p.service) {
        const popupHtml = buildPlatePopupHtml(p.service);
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
            removeRoute();
          } else {
            setSelectedTechId(tid);
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
            const techMarker = techMarkersRef.current.get(techId);
            if (techMarker) {
              const from = techMarker.getLatLng();
              const techAddr = (techMarker as any).__techAddress;
              const origin = techAddr ? techAddr : `${from.lat},${from.lng}`;
              const to = marker.getLatLng();
              const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${to.lat},${to.lng}`;
              window.open(url, "_blank");
            }
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
      const { latlngs } = pendingZoomRef.current;
      pendingZoomRef.current = null;
      if (latlngs.length === 1) {
        map.flyTo([latlngs[0].lat, latlngs[0].lng], 14, { duration: 1 });
      } else if (latlngs.length > 1) {
        const bounds = L.latLngBounds(latlngs.map((p) => [p.lat, p.lng]));
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
      }
    } else if (visiblePoints.length > 0) {
      const bounds = L.latLngBounds(visiblePoints.map((p) => [p.lat, p.lng]));
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [visiblePoints, mapReady, renderTick]);

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

  // Click map background (not on a marker) to deselect tech
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    function onMapClick(e: L.LeafletMouseEvent) {
      const target = e.originalEvent?.target as HTMLElement | null;
      if (target?.closest?.(".leaflet-marker-icon")) return;
      setSelectedTechId(null);
      removeRoute();
    }
    map.on("click", onMapClick);
    return () => map.off("click", onMapClick);
  }, [mapReady]);

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
        const popupHtml = buildPlatePopupHtml(service);
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
  }, []);

  const handleClientFilter = useCallback((_personName: string, allIds: string[], validIds: string[]) => {
    setClientSearchActive(true);
    setClientFilterIds(new Set(allIds));
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
    setClientSearchActive(false);
    setClientFilterIds(new Set());
    setRenderTick((t) => t + 1);
    pendingZoomRef.current = null;
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
        <div ref={searchAreaRef} className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1 min-w-0" data-search="tech">
            <TechSearch technicians={visibleTechs} onSelect={handleTechSelect} />
          </div>
          <div className="flex-1 min-w-0" data-search="plate">
            <PlateSearch clients={clients} onSelect={handlePlateSelect} />
          </div>
          <div className="flex-1 min-w-0" data-search="client">
            <ClientSearch clients={clients} onSelectVehicle={handlePlateSelect} onFilterPerson={handleClientFilter} onClearFilter={handleClearClientFilter} />
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
