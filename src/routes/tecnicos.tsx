import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { ImportDialog } from "@/components/import-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Loader2,
  MessageCircle,
  Phone,
  Search,
  Upload,
  User,
  Wrench,
  X,
} from "lucide-react";
import { buildTechnicians } from "@/services/build-records";
import { buildWhatsAppUrl } from "@/utils/whatsapp-url";
import { importarTecnicosEmLote } from "@/services/api";
import { applySeedAddresses } from "@/services/seed-data";
import { geocodeFullAddress } from "@/services/distance";
import type { Technician } from "@/types";

export const Route = createFileRoute("/tecnicos")({
  component: TechniciansPage,
});

type Filter = "all" | "available" | "no_stock" | "confirm" | "unknown";

const FORMAT_MARKER_RE = /\u200BFORMAT:(green|red|orange|REDD)\u200B|FORMAT:REDD/g;

function formatAddressField(raw: string): string {
  const cleaned = raw.replace(FORMAT_MARKER_RE, "").trim();
  return cleaned || "sem endereço";
}

function TechniciansPage() {
  const store = useAppStore();
  const techs = store.technicians;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const importedColumns = store.diagnostics.technicians?.columnsMapped ?? {};
  const columnLabel = (field: "technician" | "phone" | "city" | "state" | "address" | "quantity", fallback: string) =>
    importedColumns[field] || fallback;

  // Correct legacy values already stored in the browser as soon as this page
  // opens. Matching by first name (for example the two Diegos) is never used.
  useEffect(() => {
    if (techs.length === 0) return;
    const corrected = applySeedAddresses(techs);
    const hasCorrection = corrected.some((technician, index) => {
      const current = techs[index];
      return technician.address !== current.address
        || technician.addressLat !== current.addressLat
        || technician.addressLng !== current.addressLng
        || technician.cityOriginal !== current.cityOriginal
        || technician.cityNormalized !== current.cityNormalized
        || technician.state !== current.state;
    });
    if (!hasCorrection) return;
    store.setTechnicians(
      corrected,
      store.meta?.technicians || { fileName: "", count: corrected.length },
      store.diagnostics?.technicians || { fileName: "", columnsFound: [], columnsMapped: {}, columnsUnmapped: [], rowsImported: corrected.length, rowsSkipped: 0, invalidPhones: 0, emptyPlates: 0, emptyNames: 0, emptyAddresses: 0, equipmentUnknown: 0, quantityUnparsed: 0, groupedContacts: 0, nameConflicts: 0, timestamp: Date.now(), headerRow: 0 },
    );
  }, [techs, store]);

  const d1Active = useMemo(() => techs.some((t) => !!t.address), [techs]);
  const techsComEndereco = useMemo(() => techs.filter((t) => !!t.address), [techs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("pt-BR");
    return techs.filter((t) => {
      if (q) {
        const hay = [t.nameOriginal, t.cityOriginal, t.state, t.phoneOriginal, t.address]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("pt-BR");
        if (!hay.includes(q)) return false;
      }
      switch (filter) {
        case "available":
          return t.stockStatus === "DISPONIVEL";
        case "no_stock":
          return t.stockStatus === "SEM_MATERIAL";
        case "confirm":
          return t.stockStatus === "CONFIRMAR";
        case "unknown":
          return t.stockStatus === "NAO_INFORMADO" || t.stockStatus === "TEXTO_NAO_INTERPRETADO";
        default:
          return true;
      }
    });
  }, [techs, search, filter]);

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wrench className="w-6 h-6" /> Contatar aos técnicos
          </h1>
          <p className="text-sm text-muted-foreground">
            {techs.length} contatos aos técnicos importados.
            {techsComEndereco.length > 0 && (
              <span className="ml-2 text-green-600">
                · {techsComEndereco.length} com endereço real
              </span>
            )}
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Upload className="w-4 h-4 mr-2" /> Importar
        </Button>
      </div>

      {d1Active && (
        <Card className="border-green-200 bg-green-50/30 dark:bg-green-950/10 dark:border-green-900">
          <CardContent className="py-3 flex items-center gap-2 text-green-700 dark:text-green-400 text-sm">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            Endereços carregados do servidor ({techsComEndereco.length} técnicos com endereço real, {techs.length - techsComEndereco.length} com localização aproximada por cidade).
          </CardContent>
        </Card>
      )}

      {techs.length > 0 && !d1Active && (
        <Card className="border-amber-200 bg-amber-50/30 dark:bg-amber-950/10 dark:border-amber-900">
          <CardContent className="py-3 flex items-center gap-2 text-amber-700 dark:text-amber-400 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            Servidor de endereços indisponível. Cadastre endereços na importação para ativar a localização real no mapa.
          </CardContent>
        </Card>
      )}

      {techs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhum contato aos técnicos importado ainda.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex-row gap-2 flex-wrap space-y-0 items-center">
            <Input
              placeholder="Buscar por nome, cidade, UF, telefone, endereço"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
              <SelectTrigger className="max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="available">Disponível</SelectItem>
                <SelectItem value="no_stock">Sem material</SelectItem>
                <SelectItem value="confirm">Confirmar</SelectItem>
                <SelectItem value="unknown">Não informado</SelectItem>
              </SelectContent>
            </Select>
            <Badge variant="secondary">{filtered.length} exibidos</Badge>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr className="text-left">
                    <th className="p-2">{columnLabel("technician", "Nome")}</th>
                    <th className="p-2">{columnLabel("phone", "Celular")}</th>
                    <th className="p-2">{columnLabel("city", "Cidade")}</th>
                    <th className="p-2">{columnLabel("state", "UF")}</th>
                    <th className="p-2">{columnLabel("address", "Endereço")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => {
                    return(
                      <tr key={t.id} className="border-t hover:bg-muted/30">
                        <td className="p-2">{t.nameOriginal || "—"}</td>
                        <td className="p-2">
                          {(() => {
                            const phone = t.phoneNormalized || t.phoneOriginal;
                            const url = phone ? buildWhatsAppUrl(phone, "") : null;
                            return url ? (
                              <a href={url} target="_blank" rel="noopener noreferrer">
                                <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white">
                                  <MessageCircle className="w-4 h-4" />
                                </Button>
                              </a>
                            ) : t.phoneOriginal ? (
                              <span className="text-xs">{t.phoneOriginal}</span>
                            ) : (
                              <span className="text-destructive text-xs">—</span>
                            );
                          })()}
                        </td>
                        <td className="p-2">{t.cityOriginal ? formatAddressField(t.cityOriginal) : "—"}</td>
                        <td className="p-2">{t.state ? formatAddressField(t.state) : "—"}</td>
                        <td className="p-2 max-w-48 truncate text-xs" title={t.address || ""}>
                          {t.address ? (
                            <span className="text-green-700 dark:text-green-400">{t.address}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <ImportDialog
        open={open}
        onOpenChange={setOpen}
        kind="technicians"
        title="Importar contatos aos técnicos"
        onConfirm={async (rows, mapping, fileName, headerRow, sheetName) => {
          const { records, diagnostic } = buildTechnicians(rows, mapping, headerRow);

          const marcosBefore = records.filter((r) => r.firstName.toLowerCase() === "marcos");
          console.log("[MARCOS] Antes do seed:", marcosBefore.map((m) => ({
            name: m.nameOriginal,
            firstName: m.firstName,
            address: m.address,
            addressLat: m.addressLat,
            addressLng: m.addressLng,
          })));

          const enriched = applySeedAddresses(records);

          const marcosAfter = enriched.filter((r) => r.firstName.toLowerCase() === "marcos");
          console.log("[MARCOS] Depois do seed:", marcosAfter.map((m) => ({
            name: m.nameOriginal,
            address: m.address,
            addressLat: m.addressLat,
            addressLng: m.addressLng,
          })));
          store.setTechnicians(
            enriched,
            { fileName, count: enriched.length },
            { ...diagnostic, fileName, sheetName, timestamp: Date.now() },
          );

          let finalRecords = enriched;
          const toGeocode = enriched.filter(
            (t) => t.address && t.addressLat == null && t.addressLng == null,
          );
          console.log(`[GEO] Geocodificando ${toGeocode.length} endereços...`);
          if (toGeocode.length > 0) {
            const updated: Technician[] = [];
            for (const tech of toGeocode) {
              const result = await geocodeFullAddress(tech.address!);
              if (result) {
                console.log(`[GEO] OK: ${tech.firstName} → ${result.lat},${result.lng}`);
                updated.push({
                  ...tech,
                  addressLat: result.lat,
                  addressLng: result.lng,
                });
              } else {
                console.warn(`[GEO] Falhou: ${tech.firstName} (${tech.address})`);
                updated.push(tech);
              }
            }
            if (updated.length > 0) {
              finalRecords = enriched.map(
                (t) => updated.find((u) => u.id === t.id) || t,
              );
              store.setTechnicians(
                finalRecords,
                { fileName, count: finalRecords.length },
                { ...diagnostic, fileName, sheetName, timestamp: Date.now() },
              );
            }
          }

          try {
            const payload = finalRecords.map((r) => ({
              nome: r.nameOriginal,
              telefone: r.phoneNormalized || r.phoneOriginal || "",
              endereco: r.address || "",
              numero: "",
              bairro: "",
              cidade: r.cityOriginal || "",
              uf: r.state || "",
              cep: "",
              latitude: r.addressLat ?? undefined,
              longitude: r.addressLng ?? undefined,
              equipamentos: r.quantityOriginal || "",
            }));
            const result = await importarTecnicosEmLote(payload);
            console.log("[D1] Importação concluída", result);
          } catch (err) {
            console.warn("[D1] Erro ao importar técnicos no servidor", err);
          }
        }}
      />
    </div>
  );
}
