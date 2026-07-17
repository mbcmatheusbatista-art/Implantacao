import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { ConfirmedService, Technician } from "@/types";
import { brCityCoords } from "@/services/br-city-coords";
import { normalize, extractCity, getServiceDestination, type RouteDistance } from "@/services/distance";
import type { EquipmentBalance } from "@/services/equipment-balance";

const STATE_REGION: Record<string, string> = {
  AC: "Norte", AP: "Norte", AM: "Norte", PA: "Norte", RO: "Norte", RR: "Norte", TO: "Norte",
  AL: "Nordeste", BA: "Nordeste", CE: "Nordeste", MA: "Nordeste", PB: "Nordeste", PE: "Nordeste", PI: "Nordeste", RN: "Nordeste", SE: "Nordeste",
  DF: "Centro-Oeste", GO: "Centro-Oeste", MT: "Centro-Oeste", MS: "Centro-Oeste",
  ES: "Sudeste", MG: "Sudeste", RJ: "Sudeste", SP: "Sudeste",
  PR: "Sul", RS: "Sul", SC: "Sul",
};

const REGION_COLORS: Record<string, string> = {
  "Norte": "#2E7D9E",
  "Nordeste": "#C0723C",
  "Centro-Oeste": "#8A7A3A",
  "Sudeste": "#3D8F53",
  "Sul": "#7A4F9E",
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
  extra?: string;
  s8Eco?: number;
  g5Plus?: number;
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

function resolveCoords(city: string, state: string, destQuery?: string): { lat: number; lng: number } | null {
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

export const RoteirizacaoMap = memo(function RoteirizacaoMap({ technicians, clients, balances, routesByTech }: Props) {
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
      const coords = resolveCoords(t.cityOriginal || "", t.state || "");
      if (coords) {
        const bal = balances?.get(t.id);
        const extraLines: string[] = [];
        if (bal) {
          if (bal.inventory.s8Eco > 0 || bal.inventory.g5Plus > 0) {
            extraLines.push(`Estoque: ${bal.inventory.s8Eco} S8 ECO${bal.inventory.g5Plus > 0 ? ` + ${bal.inventory.g5Plus} G5` : ""}`);
          }
          if (bal.used.s8Eco > 0 || bal.used.g5Plus > 0) {
            extraLines.push(`Usados: ${bal.used.s8Eco} S8 ECO${bal.used.g5Plus > 0 ? ` + ${bal.used.g5Plus} G5` : ""}`);
          }
          if (bal.available.s8Eco > 0 || bal.available.g5Plus > 0) {
            extraLines.push(`Disponível: ${bal.available.s8Eco} S8 ECO${bal.available.g5Plus > 0 ? ` + ${bal.available.g5Plus} G5` : ""}`);
          } else if (bal.inventory.s8Eco > 0 || bal.inventory.g5Plus > 0) {
            extraLines.push("Sem saldo disponível");
          }
        }
        const s8 = bal?.inventory.s8Eco ?? 0;
        const g5 = bal?.inventory.g5Plus ?? 0;
        pts.push({
          ...coords,
          label: t.firstName || t.nameOriginal,
          type: "tech",
          details: `${t.cityOriginal || ""}/${t.state || ""}`,
          city: t.cityOriginal || "",
          state: t.state || "",
          extra: extraLines.join("<br/>"),
          s8Eco: s8,
          g5Plus: g5,
        });
        techCount.resolved++;
      } else {
        unresolvedT.push(`${t.nameOriginal || "?"} (cidade: "${t.cityOriginal}", estado: "${t.state}")`);
      }
    }
    const clientCount = { total: clients.length, resolved: 0 };
    for (const c of clients) {
      const destQuery = getServiceDestination(c);
      const coords = resolveCoords(c.cityDetected || "", c.stateDetected || "", destQuery);
      if (coords) {
        const extraLines: string[] = [];
        if (c.serviceStatus) extraLines.push(`Status: ${c.serviceStatus}`);
        if (c.technicianOriginal) extraLines.push(`Técnico: ${c.technicianOriginal}`);
        pts.push({
          ...coords,
          label: c.responsibleOriginal,
          type: "client",
          details: `${c.cityDetected || ""}/${c.stateDetected || ""}`,
          city: c.cityDetected || "",
          state: c.stateDetected || "",
          extra: extraLines.join("<br/>"),
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
      console.log("[MAPA] Pontos:", pts.map((p) => `${p.type}:${p.label} @ ${p.lat},${p.lng} [${p.city}/${p.state}]`));
    }
    if (unresolvedT.length > 0) {
      console.warn("[MAPA] Técnicos sem coordenadas:", unresolvedT);
    }
    return { points: pts, unresolvedClients: unresolved, unresolvedTechs: unresolvedT };
  }, [technicians, clients, balances]);

  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const stateLayerRef = useRef<L.GeoJSON | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leafletRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const [renderTick, setRenderTick] = useState(0);
  console.log("[MAPA] Render (techs=" + technicians.length + ", clients=" + clients.length + ", ready=" + (mapReady ? "S" : "N") + ", tick=" + renderTick + ")");

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
      map.invalidateSize();
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

  // Force marker re-apply whenever technicians or clients change
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
        const res = await fetch("https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/brazil-states.geojson");
        if (cancelled) return;
        const data = await res.json();
        if (cancelled) return;

        const layer = L.geoJSON(data, {
          pane: "statesPane",
          interactive: false,
          style: (feature: unknown) => {
            const props = (feature as Record<string, unknown>)?.properties as Record<string, string> || {};
            const stateAbbr = (props.sigla || props.SIGLA || props.abbrev || props.UF || props.uf || "").toUpperCase();
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

    return () => { cancelled = true; };
  }, [mapReady]);

  // Update markers when points or mapReady or renderTick change (without destroying the map)
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layerGroup = markerLayerRef.current;
    const L = leafletRef.current;
    if (!map || !layerGroup || !L) return;

    // Clear existing markers
    layerGroup.clearLayers();

    const cityCount = new Map<string, number>();

    for (const p of points) {
      const coordKey = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
      const count = cityCount.get(coordKey) ?? 0;
      cityCount.set(coordKey, count + 1);

      const offsetLat = count * 0.008;
      const offsetLng = count * 0.008;
      const lat = p.lat + offsetLat;
      const lng = p.lng + offsetLng;

      const isTech = p.type === "tech";
      const color = isTech ? "#2563eb" : "#dc2626";
      const shape = isTech ? "circle" : "square";
      const letter = isTech ? "T" : "C";

      let nameHtml = "";
      let badgeHtml = "";
      let iconW = 22, iconH = 22, ancX = 11, ancY = 11;
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
        iconW = 140; iconH = 22; ancX = 70; ancY = 22;
      }
      if (isTech && (p.s8Eco || p.g5Plus)) {
        const parts: string[] = [];
        if (p.s8Eco) parts.push(`📷${p.s8Eco}`);
        if (p.g5Plus) parts.push(`🛰️${p.g5Plus}`);
        const warn = (p.s8Eco !== undefined && p.s8Eco === 1) || (p.g5Plus !== undefined && p.g5Plus === 1) ? " ⚠️" : "";
        if (parts.length || warn) {
          badgeHtml = `<div style="
            font-size: 13px; white-space: nowrap;
            background: rgba(255,255,255,0.95);
            padding: 1px 5px; border-radius: 4px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.25);
            margin-top: 2px; line-height: 1.4;
            text-align: center;
          ">${parts.join(" ")}${warn}</div>`;
          iconW = 140; iconH = 56; ancX = 70; ancY = 22;
        }
      }

      const icon = L.divIcon({
        className: "",
        html: `<div style="display:flex;flex-direction:column;align-items:center;width:${iconW}px">
          ${nameHtml}
          <div style="
            width: 22px; height: 22px;
            background: ${color};
            border: 2px solid white;
            border-radius: ${shape === "circle" ? "50%" : "3px"};
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            display: flex; align-items: center; justify-content: center;
            color: white; font-size: 11px; font-weight: 700;
            font-family: Arial, sans-serif;
            cursor: pointer;
          ">${letter}</div>
          ${badgeHtml}
        </div>`,
        iconSize: [iconW, iconH],
        iconAnchor: [ancX, ancY],
      });

      const marker = L.marker([lat, lng], { icon }).addTo(layerGroup);
      const tooltipHtml = `<strong>${p.label}</strong><br/>${p.details}<br/><em>${isTech ? "Técnico" : "Cliente"}</em>${p.extra ? `<br/>${p.extra}` : ""}`;
      marker.bindTooltip(tooltipHtml, { direction: "top" });
    }

    // Debug: check actual marker count vs expected
    const actualMarkers = layerGroup.getLayers().length;
    console.log("[MAPA] Marcadores atualizados", {
      esperado: points.length,
      noMapa: actualMarkers,
      tecnicos: points.filter((p) => p.type === "tech").map((p) => p.label),
      clientes: points.filter((p) => p.type === "client").map((p) => p.label),
    });

    // Fit bounds to all points
    if (points.length > 0) {
      const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [points, mapReady, renderTick]);

  // Summary inventory
  const inventorySummary = useMemo(() => {
    if (!balances || balances.size === 0) return null;
    let totalS8 = 0, totalG5 = 0, usedS8 = 0, usedG5 = 0, pendS8 = 0, pendG5 = 0;
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

  // Legend
  return (
    <div className="space-y-1">
      <div ref={mapRef} style={{ width: "100%", height: "calc(100vh - 160px)", minHeight: "400px", borderRadius: "8px" }} className="border" />
      <div className="flex gap-4 text-xs text-muted-foreground px-1 flex-wrap">
        <span className="flex items-center gap-1">
          <span style={{ display: "inline-block", width: 12, height: 12, background: "#2563eb", borderRadius: "50%", border: "1px solid white" }} />
          Técnico
        </span>
        <span className="flex items-center gap-1">
          <span style={{ display: "inline-block", width: 12, height: 12, background: "#dc2626", borderRadius: 3 }} />
          Cliente
        </span>
        {Object.entries(REGION_COLORS).map(([region, color]) => (
          <span key={region} className="flex items-center gap-1">
            <span style={{ display: "inline-block", width: 16, height: 3, background: color, borderRadius: 1 }} />
            {region}
          </span>
        ))}
        <span>{points.length} ponto(s) no mapa</span>
        <span>{technicians.length} técnico(s) · {clients.length} cliente(s) na lista</span>
      </div>
      {inventorySummary && (
        <div className="flex gap-3 text-[10px] text-muted-foreground px-1 flex-wrap border-t pt-1">
          <span className="font-semibold">Inventário total:</span>
          <span className="text-green-600">Disponível: {inventorySummary.totalS8 - inventorySummary.usedS8 - inventorySummary.pendS8} S8 ECO / {inventorySummary.totalG5 - inventorySummary.usedG5 - inventorySummary.pendG5} G5+</span>
          {inventorySummary.usedS8 > 0 && <span>Usados: {inventorySummary.usedS8} S8 ECO / {inventorySummary.usedG5} G5+</span>}
          {inventorySummary.pendS8 > 0 && <span className="text-amber-500">Pendentes: {inventorySummary.pendS8} S8 ECO / {inventorySummary.pendG5} G5+</span>}
        </div>
      )}
    </div>
  );
});
