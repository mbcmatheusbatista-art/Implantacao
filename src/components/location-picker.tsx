import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { MapPin } from "lucide-react";

interface Props {
  /** Coordenadas atuais (do geocoder ou manual) */
  lat: number;
  lng: number;
  /** Chamado sempre que o marcador muda de posição */
  onChange: (lat: number, lng: number) => void;
  height?: number;
}

function loadLeafletCss() {
  if (document.querySelector("#leaflet-css")) return;
  const link = document.createElement("link");
  link.id = "leaflet-css";
  link.rel = "stylesheet";
  link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
  document.head.appendChild(link);
}

/**
 * Mini-mapa com marcador reposicionável. O pino permanece no local atual até
 * o usuário clicar em outro ponto do mapa (ou arrastar o pino) — então o
 * marcador é reposicionado e as coordenadas são propagadas para o diálogo.
 */
export default function LocationPicker({ lat, lng, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ map: unknown; marker: unknown; L: any; invalidate?: () => void; syncLatLng?: (a: number, b: number) => void } | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let cancelled = false;
    loadLeafletCss();
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;

      const map = L.map(containerRef.current, {
        center: [lat, lng],
        zoom: 17,
        zoomControl: true,
      });
      const invalidate = () => map.invalidateSize();
      L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        },
      ).addTo(map);
      // Dentro de um modal animado o container pode ter dimensão 0, o que
      // desloca o clique em relação ao local do mouse. Recalcula o tamanho.
      setTimeout(invalidate, 0);
      setTimeout(invalidate, 100);
      setTimeout(invalidate, 400);
      window.addEventListener("resize", invalidate);

      const icon = L.divIcon({
        className: "",
        html: '<div style="font-size:28px;line-height:28px;width:28px;height:28px;text-align:center"><span>&#128205;</span></div>',
        iconSize: [28, 28],
        iconAnchor: [14, 28],
      });

      const marker = L.marker([lat, lng], { icon, draggable: true }).addTo(map);
      const commit = () => {
        const pos = marker.getLatLng();
        onChangeRef.current(pos.lat, pos.lng);
      };
      let dragging = false;

      marker.on("dragstart", () => {
        dragging = true;
      });
      marker.on("dragend", () => {
        dragging = false;
        commit();
      });
      marker.on("drag", commit);

      // O pino só muda de posição quando o usuário clica no local desejado.
      map.on("click", (e: { latlng: { lat: number; lng: number } }) => {
        if (dragging) return;
        marker.setLatLng([e.latlng.lat, e.latlng.lng]);
        onChangeRef.current(e.latlng.lat, e.latlng.lng);
      });

      // Mantém o pino alinhado ao ponto geocodificado mesmo quando lat/lng
      // vem do texto (ex.: o número da rua foi digitado). O pino só não é
      // movido enquanto o usuário está arrastando para não "perder" o ajuste.
      let manualMove = false;
      map.on("mousedown", () => {
        manualMove = true;
      });
      map.on("mouseup", () => {
        manualMove = false;
      });

      const syncLatLng = (nextLat: number, nextLng: number) => {
        if (dragging || manualMove) return;
        const pos = marker.getLatLng();
        if (pos.lat === nextLat && pos.lng === nextLng) return;
        marker.setLatLng([nextLat, nextLng]);
        map.panTo([nextLat, nextLng], { animate: true });
      };

      mapRef.current = { map: map as unknown, marker, L, invalidate, syncLatLng };
    })();

    return () => {
      cancelled = true;
      const ref = mapRef.current;
      if (ref) {
        try {
          if (typeof ref.invalidate === "function") {
            window.removeEventListener("resize", ref.invalidate);
          }
        } catch {
          /* noop */
        }
        try {
          (ref.map as { remove: () => void }).remove();
        } catch {
          /* noop */
        }
        mapRef.current = null;
      }
    };
    // incomum: inicializa apenas uma vez
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-geocodificado (ex.: número digitado) → reposiciona o marcador.
  useEffect(() => {
    const ref = mapRef.current;
    if (!ref || typeof ref.syncLatLng !== "function") return;
    ref.syncLatLng(lat, lng);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

return (
    <div className="flex flex-col h-full min-h-0 space-y-2">
      <div
        ref={containerRef}
        className="w-full flex-1 min-h-0 rounded-md border overflow-hidden z-0"
      />
      <div className="flex items-center justify-between gap-2 shrink-0">
        <div className="text-xs text-muted-foreground">
          Clique no local desejado no mapa (ou arraste o pino) para reposicionar o ponto exato.
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const url = `https://www.google.com/maps?q=${LatFmt(lat)},${LngFmt(lng)}`;
            window.open(url, "_blank", "noopener,noreferrer");
          }}
        >
          <MapPin className="w-3.5 h-3.5 mr-1" /> Ver no Google
        </Button>
      </div>
    </div>
  );
}

function LatFmt(v: number) {
  return v.toFixed(7);
}
function LngFmt(v: number) {
  return v.toFixed(7);
}