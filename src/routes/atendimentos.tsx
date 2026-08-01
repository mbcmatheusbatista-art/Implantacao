import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MessageCircle, Upload, ClipboardCheck, Share2 } from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { ImportDialog } from "@/components/import-dialog";
import { buildConfirmedServices } from "@/services/build-records";
import { buildWhatsAppUrl } from "@/utils/whatsapp-url";
import { equipmentLabel } from "@/utils/normalize-equipment";
import { normalizeText, stripFormatMarkers } from "@/utils/normalize-text";
import { findFixedTechnicianLocationByName } from "@/services/seed-data";

export const Route = createFileRoute("/atendimentos")({
  component: ConfirmedServicesPage,
});

type Filter = "all" | "with_address" | "no_address" | "s8_eco" | "s8_eco_g5" | "unassigned" | "agendado" | "agendando" | "agendar";

const KNOWN_TECHNICIAN_PHONES: Record<string, string> = {
  "DIEGO SOUZA BALDUINO": "18 99751-4360",
};

const ALL_STATUSES = "__all_statuses__";

function hasUsableAddress(address: string | undefined): boolean {
  const normalized = normalizeText(address);
  return Boolean(normalized) && !["SEM ENDERECO", "NAO INFORMADO", "N A", "-", "—"].includes(normalized);
}

function ConfirmedServicesPage() {
  const store = useAppStore();
  const services = store.confirmedServices;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [statusFilter, setStatusFilter] = useState(ALL_STATUSES);
  const importedColumns = store.diagnostics.confirmed?.columnsMapped ?? {};
  const columnLabel = (field: "plate" | "responsible" | "phone" | "address" | "equipment" | "status" | "technician", fallback: string) =>
    importedColumns[field] || fallback;

  const assignedIds = useMemo(
    () => new Set(store.assignments.map((a) => a.serviceId)),
    [store.assignments],
  );
  const statusOptions = useMemo(
    () =>
      [...new Set(
        services
          .map((service) => stripFormatMarkers(service.serviceStatusOriginal || service.serviceStatus || "").trim())
          .filter(Boolean),
      )].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [services],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("pt-BR");
    return services.filter((s) => {
      if (q) {
        const hay = [
          s.plateOriginal,
          s.responsibleOriginal,
          s.cityDetected,
          s.stateDetected,
          s.equipmentOriginal,
          s.fullAddress,
          s.technicianOriginal,
          s.serviceStatus,
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("pt-BR");
        if (!hay.includes(q)) return false;
      }
      const displayedStatus = stripFormatMarkers(s.serviceStatusOriginal || s.serviceStatus || "").trim();
      if (statusFilter !== ALL_STATUSES && displayedStatus !== statusFilter) return false;
      switch (filter) {
        case "with_address":
          return hasUsableAddress(s.fullAddress);
        case "no_address":
          return !hasUsableAddress(s.fullAddress);
        case "s8_eco":
          return s.equipmentNormalized === "S8_ECO";
        case "s8_eco_g5":
          return s.equipmentNormalized === "S8_ECO_G5_PLUS";
        case "unassigned":
          return !assignedIds.has(s.id);
        case "agendado":
          return s.serviceStatus === "AGENDADO";
        case "agendando":
          return s.serviceStatus === "AGENDANDO";
        case "agendar":
          return s.serviceStatus === "AGENDAR";
        default:
          return true;
      }
    });
  }, [services, search, filter, statusFilter, assignedIds]);

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6" /> Cliente com endereço
          </h1>
          <p className="text-sm text-muted-foreground">
            {services.length} clientes com endereço importados.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/distribuicao">
            <Button variant="outline">
              <Share2 className="w-4 h-4 mr-2" /> Distribuir
            </Button>
          </Link>
          <Button onClick={() => setOpen(true)}>
            <Upload className="w-4 h-4 mr-2" /> Importar
          </Button>
        </div>
      </div>

      {services.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhum cliente com endereço importado ainda.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex-row gap-2 flex-wrap space-y-0 items-center">
            <Input
              placeholder="Buscar placa, responsável, cidade, UF, equipamento"
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
                <SelectItem value="with_address">Endereço preenchido</SelectItem>
                <SelectItem value="no_address">Endereço vazio</SelectItem>
                <SelectItem value="s8_eco">S8 ECO</SelectItem>
                <SelectItem value="s8_eco_g5">S8 ECO + G5 Plus</SelectItem>
                <SelectItem value="unassigned">Sem técnico</SelectItem>
                <SelectItem value="agendado">AGENDADO</SelectItem>
                <SelectItem value="agendando">AGENDANDO</SelectItem>
                <SelectItem value="agendar">AGENDAR</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="max-w-xs">
                <SelectValue placeholder="Filtrar por status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_STATUSES}>Todos os status</SelectItem>
                {statusOptions.map((status) => (
                  <SelectItem key={status} value={status}>{status}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge variant="secondary">{filtered.length} exibidos</Badge>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr className="text-left">
                    <th className="p-2">{columnLabel("status", "Status")}</th>
                    <th className="p-2">{columnLabel("plate", "Placa")}</th>
                    <th className="p-2">{columnLabel("responsible", "Responsável")}</th>
                    <th className="p-2">{columnLabel("phone", "Telefone")}</th>
                    <th className="p-2">{columnLabel("address", "Endereço")}</th>
                    <th className="p-2">Cidade/UF</th>
                    <th className="p-2">{columnLabel("equipment", "Equipamento")}</th>
                    <th className="p-2 bg-violet-100 text-violet-950 border-l border-violet-200">
                      {columnLabel("technician", "Possível técnico")}
                    </th>
                    <th className="p-2 text-center bg-violet-100 text-violet-950 border-r border-violet-200">
                      WhatsApp técnico
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => {
                    const a = store.assignments.find((x) => x.serviceId === s.id);
                    const fmtRe = /\u200BFORMAT:(green|red|orange|REDD)\u200B|FORMAT:REDD/g;
                    const rawTechnician = (s.technicianOriginal ?? "").replace(fmtRe, "").trim();
                    // Imported notes such as "Confirmar se é mais perto após
                    // ter endereço Vinicius Araújo / 51 ..." are instructions,
                    // not a technician name. Keep the contact part for lookup
                    // but never display the instruction in the table.
                    const technicianNotePhone = rawTechnician;
                    const cleanName = rawTechnician
                      .replace(/^confirmar\s+se\s+[ée]?\s*mais\s+perto\s+ap[óo]s\s+ter\s+endere[cç]o\s+/i, "")
                      .replace(/\s*[/|]\s*\(?\d[\d\s().-]*\d\)?(?:\s*\([^)]*\))?\s*$/, "")
                      .trim();
                    const assignedTech = a
                      ? store.technicians.find((x) => x.id === a.technicianId)
                      : null;
                    const normalizedName = normalizeText(cleanName);
                    const nameMatches = normalizedName
                      ? store.technicians.filter((x) => {
                          const candidate = normalizeText(x.nameOriginal);
                          return candidate.includes(normalizedName) || normalizedName.includes(candidate);
                        })
                      : [];
                    // An assignment may point to an older contact row without
                    // a phone. Prefer a matching technician record that has a
                    // valid number, while retaining the assigned name.
                    const t = [assignedTech, ...nameMatches].filter(Boolean).find((x) =>
                      Boolean(x?.phoneNormalized || x?.phoneOriginal || x?.allPhones?.length),
                    ) ?? assignedTech ?? nameMatches[0] ?? null;
                    const contactMatches = normalizedName
                      ? store.initialContacts.filter((contact) => {
                          const candidate = normalizeText(contact.responsibleOriginal);
                          return candidate.includes(normalizedName) || normalizedName.includes(candidate);
                        })
                      : [];
                    const technicianPhoneSource = [t, ...contactMatches].find((contact) =>
                      Boolean(contact?.phoneNormalized || contact?.phoneOriginal || contact?.allPhones?.length),
                    ) ?? null;
                    const matchingTechnicianNotes = normalizedName
                      ? services
                          .map((service) => service.technicianOriginal ?? "")
                          .filter((value) => {
                            const candidate = normalizeText(value);
                            return candidate.includes(normalizedName) || normalizedName.includes(candidate);
                          })
                      : [];
                    const knownTechnicianPhone = KNOWN_TECHNICIAN_PHONES[normalizedName] ?? "";
                    const fixedLocation = findFixedTechnicianLocationByName(cleanName, t?.state ?? "");
                    const technicianAddress = fixedLocation?.address || t?.address || "";
                    const hasAddress = hasUsableAddress(s.fullAddress);
                    const isFinalized =
                      s.serviceStatus === "FINALIZADO" ||
                      normalizeText(s.serviceStatusOriginal) === "FINALIZADO";
                    const googleMapsRoute = hasAddress
                      ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(s.fullAddress)}${technicianAddress ? `&destination=${encodeURIComponent(technicianAddress)}` : ""}`
                      : null;
                    return (
                      <tr
                        key={s.id}
                        className={`border-t ${
                          isFinalized
                            ? "bg-emerald-700 text-white hover:bg-emerald-700 [&>td]:!bg-emerald-700 [&>td]:!text-white [&>td]:border-emerald-600"
                            : "hover:bg-muted/30"
                        }`}
                      >
                        <td className="p-2">
                          <Badge
                            className={`text-[10px] ${
                              s.serviceStatus === "AGENDADO" ? "bg-blue-600 hover:bg-blue-700" :
                              s.serviceStatus === "AGENDAR" ? "bg-orange-500 hover:bg-orange-600" :
                              s.serviceStatus === "AGENDANDO" ? "bg-black hover:bg-gray-900" :
                              isFinalized ? "!bg-white !text-emerald-700 hover:!bg-emerald-50" : ""
                            }`}
                          >
                            {s.serviceStatusOriginal || s.serviceStatus || "—"}
                          </Badge>
                        </td>
                        <td className="p-2 font-mono text-xs">{s.plateOriginal || "—"}</td>
                        <td className="p-2">
                          {(() => {
                            const estaCom = s.responsibleOriginal?.match(/\(est[áa] com ((o|a) )?([a-zA-Zà-üÀ-Ü\s]+)\)/i);
                            const cleanName = s.responsibleOriginal?.replace(/\s*\(est[áa] com ((o|a) )?[a-zA-Zà-üÀ-Ü\s]+\)/i, "").trim() || "—";
                            const extraPhones = s.phoneOriginal ? [...s.phoneOriginal.matchAll(/\((\d[\d\s\-]*\d)\)/g)].map(m => m[1].trim()) : [];
                            let extraPhone = extraPhones.length > 0 ? extraPhones[extraPhones.length - 1] : null;
                            const extraName = estaCom ? estaCom[3].trim() : null;
                            if (estaCom && !extraPhone) {
                              const found = services.find((x) => x.responsibleOriginal?.toLowerCase().includes(extraName.toLowerCase()));
                              if (found) extraPhone = found.phoneNormalized || found.phoneOriginal;
                            }
                            const extraUrl = extraPhone ? buildWhatsAppUrl(extraPhone, "") : null;
                            return (
                              <>
                                <div className="font-medium">{cleanName}</div>
                                {extraName && extraUrl && (
                                  <div className="flex items-center gap-1 mt-0.5 text-xs">
                                    <span className="text-destructive font-medium">está com {estaCom[2] || ""}</span>
                                    <a href={extraUrl} target="_blank" rel="noopener noreferrer">
                                      <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white h-5 px-1.5 text-[9px]">
                                        {extraName}
                                      </Button>
                                    </a>
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </td>
                        <td className="p-2">
                          {(() => {
                            const phone = s.phoneNormalized || s.phoneOriginal;
                            const url = phone ? buildWhatsAppUrl(phone, "") : null;
                            return url ? (
                              <a href={url} target="_blank" rel="noopener noreferrer">
                                <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white">
                                  <MessageCircle className="w-4 h-4" />
                                </Button>
                              </a>
                            ) : (
                              <span className="text-destructive text-xs">—</span>
                            );
                          })()}
                        </td>
                        <td
                          className={`p-2 max-w-xs truncate ${hasAddress ? "" : "bg-red-600 text-white font-medium"}`}
                          title={googleMapsRoute ? "Abrir rota no Google Maps" : "Endereço não informado"}
                        >
                          {(() => {
                            const cleaned = (s.fullAddress ?? "").replace(/\u200BFORMAT:(green|red|orange|REDD)\u200B|FORMAT:REDD/g, "").trim();
                            const text = hasAddress ? cleaned : "Sem endereço";
                            return googleMapsRoute ? <a href={googleMapsRoute} target="_blank" rel="noopener noreferrer" className={isFinalized ? "text-white hover:underline" : "text-primary hover:underline"}>{text}</a> : text;
                          })()}
                        </td>
                        <td className="p-2 text-xs">
                          {s.cityDetected || "—"}/{s.stateDetected || "—"}
                        </td>
                        <td className="p-2">
                          <Badge
                            variant={
                              s.equipmentNormalized === "NAO_IDENTIFICADO"
                                ? "destructive"
                                : "outline"
                            }
                            className={isFinalized ? "!border-white/70 !bg-transparent !text-white" : undefined}
                          >
                            {equipmentLabel(s.equipmentNormalized)}
                          </Badge>
                        </td>
                        <td className="p-2 text-xs font-medium bg-violet-50/70 border-l border-violet-100">
                          {(() => {
                            const tech = t || (cleanName ? store.technicians.find((x) => x.nameOriginal.toLowerCase().trim().includes(cleanName.toLowerCase()) || cleanName.toLowerCase().includes(x.nameOriginal.toLowerCase().trim())) : null);
                            const name = tech ? (tech.firstName || tech.nameOriginal) : cleanName;
                            if (!name) {
                              return (
                                <Link
                                  to="/distribuicao"
                                  search={{ serviceId: s.id }}
                                  className="text-xs text-primary hover:underline"
                                >
                                  Atribuir
                                </Link>
                              );
                            }
                            return name;
                          })()}
                        </td>
                        <td className="p-2 text-center bg-violet-50/70 border-r border-violet-100">
                          <div className="flex items-center justify-center gap-1.5">
                            {(() => {
                              const tech = t || (cleanName ? store.technicians.find((x) => x.nameOriginal.toLowerCase().trim().includes(cleanName.toLowerCase()) || cleanName.toLowerCase().includes(x.nameOriginal.toLowerCase().trim())) : null);
                              const name = tech ? (tech.firstName || tech.nameOriginal) : cleanName;
                              const phoneRaw = [
                                technicianPhoneSource?.phoneNormalized,
                                technicianPhoneSource?.phoneOriginal,
                                technicianPhoneSource?.allPhones?.join("/"),
                                technicianNotePhone,
                                ...matchingTechnicianNotes,
                                knownTechnicianPhone,
                                !tech ? cleanName : "",
                              ].filter(Boolean).join("/");
                              const phoneParts = phoneRaw ? phoneRaw.split("/").map(p => p.trim()).filter(Boolean) : [];
                              const contacts: { name: string; digits: string }[] = [];
                              for (const part of phoneParts) {
                                const nameMatch = part.match(/\(([^)]+)\)/);
                                const contactName = nameMatch ? nameMatch[1].trim().split(" ")[0] : "";
                                const digits = part.replace(/\D/g, "");
                                if (digits.length >= 8 && !contacts.some((contact) => contact.digits === digits)) {
                                  contacts.push({ name: contactName, digits });
                                }
                              }

                              console.log(`[ATENDIMENTOS] Analisando técnico para WPP:`, {
                                serviceId: s.id,
                                cleanName,
                                techResolved: tech ? tech.nameOriginal : null,
                                contacts,
                              });

                              if (contacts.length > 0) {
                                return contacts.slice(0, 1).map((c, i) => {
                                  const url = buildWhatsAppUrl(c.digits, "");
                                  return url ? (
                                    <a key={i} href={url} target="_blank" rel="noopener noreferrer" title={c.name ? `Contato: ${c.name}` : undefined}>
                                      <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white h-6 w-6 p-0 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 shadow-sm">
                                        <MessageCircle className="w-3.5 h-3.5" />
                                      </Button>
                                    </a>
                                  ) : null;
                                });
                              } else {
                                return <span className="text-destructive text-xs">sem telefone</span>;
                              }
                            })()}
                          </div>
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
        kind="confirmed"
        title="Importar cliente com endereço"
        onConfirm={(rows, mapping, fileName, headerRow, sheetName) => {
          const { records, diagnostic } = buildConfirmedServices(rows, mapping, headerRow);
          store.setConfirmedServices(
            records,
            { fileName, count: records.length },
            { ...diagnostic, fileName, sheetName, timestamp: Date.now() },
          );
        }}
      />
    </div>
  );
}
