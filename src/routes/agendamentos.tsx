import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarDays, Filter, MessageCircle } from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { MessageDialog } from "@/components/message-dialog";
import { equipmentLabel } from "@/utils/normalize-equipment";
import { formatPhoneForDisplay, normalizeBrazilianPhone } from "@/utils/normalize-phone";
import type { ConfirmedService } from "@/types";

export const Route = createFileRoute("/agendamentos")({
  component: AgendamentosPage,
});

const STATUS_OPTIONS = ["AGENDADO", "AGENDANDO", "AGENDAR"] as const;

type StatusOverrides = Record<string, (typeof STATUS_OPTIONS)[number]>;

function AgendamentosPage() {
  const store = useAppStore();
  const services = store.confirmedServices;
  const technicians = store.technicians;
  const initialContacts = store.initialContacts;


  const [statusOverrides, setStatusOverrides] = useState<StatusOverrides>({});
  const [selectedTechFilter, setSelectedTechFilter] = useState<string>("all");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>("all");
  const [hiddenTechs, setHiddenTechs] = useState<Set<string>>(new Set());
  const [includeAgendando, setIncludeAgendando] = useState(true);
  const [reminderScheduling, setReminderScheduling] = useState(false);
  const [messageTech, setMessageTech] = useState<{
    tech: typeof technicians[number];
    text: string;
    phone: string | null;
  } | null>(null);

  const techMap = useMemo(() => {
    const byName = new Map<string, typeof technicians[number]>();
    const byId = new Map<string, typeof technicians[number]>();
    for (const t of technicians) {
      byId.set(t.id, t);
      const key = t.nameOriginal.toLowerCase().trim();
      const existing = byName.get(key);
      if (!existing) {
        byName.set(key, t);
      } else {
        const existingPhone = existing.phoneNormalized ?? existing.allPhones?.[0] ?? existing.phoneOriginal;
        const newPhone = t.phoneNormalized ?? t.allPhones?.[0] ?? t.phoneOriginal;
        if (!existingPhone && newPhone) {
          byName.set(key, t);
        } else if (existingPhone && !newPhone) {
          const merged = { ...existing };
          if (t.phoneOriginal && !existing.phoneOriginal) merged.phoneOriginal = t.phoneOriginal;
          if (t.phoneNormalized && !existing.phoneNormalized) merged.phoneNormalized = t.phoneNormalized;
          if (t.allPhones?.length) {
            merged.allPhones = [...new Set([...existing.allPhones, ...t.allPhones])];
          }
          byName.set(key, merged);
        }
      }
    }
    return { byName, byId };
  }, [technicians]);

  const uniqueTechOptions = useMemo(() => {
    const names = new Set<string>();
    const list: { label: string; value: string }[] = [];
    for (const s of services) {
      const name = s.technicianOriginal?.trim();
      if (!name || names.has(name.toLowerCase()) || hiddenTechs.has(name.toLowerCase())) continue;
      names.add(name.toLowerCase());
      const match = techMap.byName.get(name.toLowerCase());
      list.push({
        label: match ? `${name} — ${match.cityOriginal}/${match.state}` : name,
        value: match ? `tech_${match.id}` : `name_${name}`,
      });
    }
    for (const t of technicians) {
      const key = t.nameOriginal.toLowerCase();
      if (names.has(key) || hiddenTechs.has(key)) continue;
      names.add(key);
      list.push({
        label: `${t.nameOriginal} — ${t.cityOriginal}/${t.state}`,
        value: `tech_${t.id}`,
      });
    }
    list.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
    return list;
  }, [services, techMap, hiddenTechs]);

  function getEffectiveStatus(svc: ConfirmedService): (typeof STATUS_OPTIONS)[number] {
    const override = statusOverrides[svc.id];
    if (override) return override;
    const fromService = svc.serviceStatus?.toUpperCase();
    if (fromService === "AGENDADO" || fromService === "AGENDANDO" || fromService === "AGENDAR") {
      return fromService;
    }
    return "AGENDAR";
  }

  const fmtRe = /\u200BFORMAT:(green|red|orange)\u200B/g;
  function cl(text: string | null | undefined): string {
    if (!text) return "";
    return text.replace(fmtRe, "").trim();
  }

  function getDataHora(svc: ConfirmedService): string {
    return cl(svc.dataHora);
  }

  function getStatusDisplay(svc: ConfirmedService): string {
    const cleaned = cl(svc.serviceStatusOriginal);
    return cleaned || getEffectiveStatus(svc);
  }

  const uniqueStatusOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of services) {
      const display = getStatusDisplay(s);
      if (display) set.add(display);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [services]);

  function namesMatch(a: string, b: string): boolean {
    const x = a.toLowerCase().trim();
    const y = b.toLowerCase().trim();
    if (x === y) return true;
    if (x.includes(y) || y.includes(x)) return true;
    return false;
  }

  function resolveTech(value: string): typeof technicians[number] | null {
    if (value.startsWith("tech_")) {
      const id = value.slice(5);
      return techMap.byId.get(id) ?? null;
    }
    if (value.startsWith("name_")) {
      const name = value.slice(5);
      const exact = techMap.byName.get(name.toLowerCase().trim());
      if (exact) return exact;
      for (const [key, tech] of techMap.byName) {
        if (namesMatch(name, key)) return tech;
      }
      return null;
    }
    return null;
  }

  function resolveTechName(value: string): string {
    if (value.startsWith("tech_") || value.startsWith("name_")) {
      const raw = value.slice(5);
      const tech = resolveTech(value);
      return tech?.nameOriginal || raw;
    }
    return value;
  }

  function findTechByName(name: string): typeof technicians[number] | null {
    const exact = techMap.byName.get(name.toLowerCase().trim());
    if (exact) return exact;
    for (const [key, tech] of techMap.byName) {
      if (namesMatch(name, key)) return tech;
    }
    return null;
  }

  function phoneForTech(tech: typeof technicians[number] | null, fallbackName: string): string | null {
    const phoneFrom = (candidate: typeof technicians[number] | null | undefined): string | null => {
      if (!candidate) return null;
      return (
        candidate.phoneNormalized ??
        candidate.allPhones?.[0] ??
        normalizeBrazilianPhone(candidate.phoneOriginal).primary ??
        normalizeBrazilianPhone(candidate.nameOriginal).primary ??
        null
      );
    };

    const direct = phoneFrom(tech);
    if (direct) return direct;

    // Nomes do atendimento podem estar abreviados (ex.: "Helder") ou conter o
    // número junto ao nome. Quando houver mais de um registro semelhante,
    // priorizamos o que possui telefone válido.
    const matchingTechnician = technicians.find((candidate) =>
      namesMatch(candidate.nameOriginal, fallbackName) && !!phoneFrom(candidate),
    );
    const matchedPhone = phoneFrom(matchingTechnician);
    if (matchedPhone) return matchedPhone;

    return normalizeBrazilianPhone(fallbackName).primary;
  }

  function hasAddress(svc: ConfirmedService): boolean {
    return !!(svc.fullAddress && svc.fullAddress.trim().length > 0);
  }

  function normalizedKey(value: string | null | undefined): string {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  function shortName(value: string): string {
    const parts = value.trim().split(/\s+/).filter(Boolean);
    if (parts.length <= 2) return parts.join(" ");
    const ignored = new Set(["de", "da", "do", "das", "dos", "e"]);
    const first = parts[0];
    const surname = parts.slice(1).find((part) => !ignored.has(part.toLowerCase()));
    return [first, surname].filter(Boolean).join(" ");
  }

  function getReminderContact(svc: ConfirmedService): { name: string; phone: string } {
    const plate = normalizedKey(svc.plateOriginal);
    const responsible = cl(svc.responsibleOriginal);
    const assignedMatch = responsible.match(/est[aá]\s+com\s+(?:o|a)\s+([A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+){0,2})/i);
    const assignedName = assignedMatch?.[1]?.trim();
    const contactsByPlate = initialContacts.filter(
      (contact) =>
        normalizedKey(contact.plateNormalized) === plate ||
        contact.plates.some((contactPlate) => normalizedKey(contactPlate) === plate),
    );
    const contactsByName = initialContacts.filter((contact) =>
      namesMatch(contact.responsibleOriginal, assignedName || responsible),
    );
    const contactPhone = (
      contact: typeof initialContacts[number] | undefined,
      preferAssignedPerson = false,
    ): string => {
      if (!contact) return "";
      const normalized = [
        ...(contact.allPhones ?? []),
        ...(normalizeBrazilianPhone(contact.phoneOriginal).all ?? []),
        contact.phoneNormalized ?? "",
      ].filter((value, index, list) => value && list.indexOf(value) === index);
      const chosen = preferAssignedPerson && normalized.length > 1
        ? normalized[normalized.length - 1]
        : normalized[0];
      return chosen ? formatPhoneForDisplay(chosen) : "";
    };
    const contactByPlate = contactsByPlate.find((contact) => contactPhone(contact, !!assignedName)) ?? contactsByPlate[0];
    const contactByName = contactsByName.find((contact) => contactPhone(contact, !!assignedName)) ?? contactsByName[0];
    const directPhone = /\d{8,}/.test(svc.phoneOriginal || "")
      ? svc.phoneOriginal
      : svc.phoneNormalized || "";

    return {
      name: shortName(assignedName || responsible) || "—",
      phone:
        contactPhone(contactByPlate, !!assignedName) ||
        contactPhone(contactByName, !!assignedName) ||
        directPhone ||
        "—",
    };
  }

  function filterByTech(svc: ConfirmedService, value: string): boolean {
    const svcName = svc.technicianOriginal?.toLowerCase().trim() || "";
    if (!svcName) return false;
    if (value.startsWith("tech_")) {
      const tech = resolveTech(value);
      return tech ? namesMatch(svcName, tech.nameOriginal) : false;
    }
    if (value.startsWith("name_")) {
      return namesMatch(svcName, value.slice(5));
    }
    return namesMatch(svcName, value);
  }

  const filteredServices = useMemo(() => {
    let result = [...services];
    result = result.filter((s) => {
      const name = s.technicianOriginal?.toLowerCase().trim();
      return !(name && hiddenTechs.has(name));
    });
    if (selectedTechFilter !== "all") {
      result = result.filter((s) => filterByTech(s, selectedTechFilter));
    }
    if (selectedStatusFilter !== "all") {
      result = result.filter((s) => getStatusDisplay(s) === selectedStatusFilter);
    }
    result = result.filter((s) => {
      if (getEffectiveStatus(s) === "AGENDADO" && !hasAddress(s)) return false;
      return true;
    });
    return result;
  }, [services, selectedTechFilter, selectedStatusFilter, statusOverrides, hiddenTechs]);

  const selectedTechObj = useMemo(() => {
    if (selectedTechFilter === "all") return null;
    return resolveTech(selectedTechFilter);
  }, [selectedTechFilter, techMap]);

  const messageServices = useMemo(() => {
    if (selectedTechFilter === "all") return [];
    let result = [...services];
    result = result.filter((s) => {
      const name = s.technicianOriginal?.toLowerCase().trim();
      return !(name && hiddenTechs.has(name));
    });
    result = result.filter((s) => filterByTech(s, selectedTechFilter));
    result = result.filter((s) => {
      if (getEffectiveStatus(s) === "AGENDADO" && !hasAddress(s)) return false;
      return true;
    });
    result = result.filter((s) => {
      const st = getEffectiveStatus(s);
      if (st === "AGENDADO") return true;
      if (st === "AGENDANDO" && includeAgendando) return true;
      return false;
    });
    return result;
  }, [services, selectedTechFilter, hiddenTechs, statusOverrides, includeAgendando]);

  function nextBusinessDay(from = new Date()): Date {
    const target = new Date(from);
    target.setHours(0, 0, 0, 0);
    target.setDate(target.getDate() + 1);
    while (target.getDay() === 0 || target.getDay() === 6) {
      target.setDate(target.getDate() + 1);
    }
    return target;
  }

  function serviceDateKey(svc: ConfirmedService): string | null {
    const match = getDataHora(svc).match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
    if (!match) return null;
    return match[1].padStart(2, "0") + "/" + match[2].padStart(2, "0");
  }

  function dateKey(date: Date): string {
    return String(date.getDate()).padStart(2, "0") + "/" + String(date.getMonth() + 1).padStart(2, "0");
  }

  const reminderTarget = useMemo(() => nextBusinessDay(), []);

  const reminderServices = useMemo(() => {
    if (selectedTechFilter === "all") return [];
    const target = dateKey(reminderTarget);
    return services.filter((svc) => {
      const name = svc.technicianOriginal?.toLowerCase().trim();
      return (
        !(name && hiddenTechs.has(name)) &&
        filterByTech(svc, selectedTechFilter) &&
        getEffectiveStatus(svc) === "AGENDADO" &&
        hasAddress(svc) &&
        serviceDateKey(svc) === target
      );
    });
  }, [services, selectedTechFilter, hiddenTechs, statusOverrides, reminderTarget]);

  const reminderGroups = useMemo(() => {
    if (!reminderScheduling) return [];
    const target = dateKey(reminderTarget);
    const grouped = new Map<string, ConfirmedService[]>();
    for (const service of services) {
      const technicianName = service.technicianOriginal?.trim();
      const hiddenName = technicianName?.toLowerCase();
      if (
        !technicianName ||
        (hiddenName && hiddenTechs.has(hiddenName)) ||
        (selectedTechFilter !== "all" && !filterByTech(service, selectedTechFilter)) ||
        getEffectiveStatus(service) !== "AGENDADO" ||
        !hasAddress(service) ||
        serviceDateKey(service) !== target
      ) {
        continue;
      }
      const key = technicianName.toLowerCase();
      const current = grouped.get(key);
      if (current) current.push(service);
      else grouped.set(key, [service]);
    }
    return [...grouped.entries()].map(([key, items]) => ({
      key,
      technicianName: items[0].technicianOriginal?.trim() || "Técnico não informado",
      items,
    }));
  }, [services, reminderScheduling, selectedTechFilter, hiddenTechs, statusOverrides, reminderTarget]);

  function buildMessageText(): string {
    if (messageServices.length === 0) return "";

    const blocks = Object.entries(
      messageServices.reduce<Record<string, typeof messageServices>>((acc, s) => {
        const st = getEffectiveStatus(s);
        if (!acc[st]) acc[st] = [];
        acc[st].push(s);
        return acc;
      }, {})
    )
      .map(([status, list]) => {
        const title = `*${status}*`;
        const lines = list.map(
          (s) =>
            `*${s.plateOriginal || "—"}*  |  ${getDataHora(s) || "sem data"}  |  ${s.fullAddress}  |  ${equipmentLabel(s.equipmentNormalized)}`
        );
        return [title, "", ...lines].join("\n");
      });
    const separator = "------------------------------------------------------------";
    return blocks.join("\n\n" + separator + "\n\n");
  }

  function buildReminderMessage(
    servicesForReminder = reminderServices,
    technicianName = resolveTechName(selectedTechFilter),
  ): string {
    if (servicesForReminder.length === 0) return "";
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
    const technician = findTechByName(technicianName);
    const techName = (technician?.firstName || technicianName.split(/\s+/)[0] || "técnico").trim();
    const targetIsTomorrow = dateKey(reminderTarget) === dateKey(new Date(Date.now() + 86_400_000));
    const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(reminderTarget);
    const confirmation = targetIsTomorrow
      ? "Tudo certo para amanhã?"
      : "Tudo certo para " + weekday + ", " + dateKey(reminderTarget) + "?";

    const grouped = new Map<string, { contact: { name: string; phone: string }; items: ConfirmedService[] }>();
    for (const service of servicesForReminder) {
      const contact = getReminderContact(service);
      const key = normalizedKey(contact.name) + "::" + contact.phone.replace(/\D/g, "");
      const existing = grouped.get(key);
      if (existing) existing.items.push(service);
      else grouped.set(key, { contact, items: [service] });
    }

    const details = [...grouped.values()].map(({ contact, items }) => {
      const equipment = [...new Set(items.map((item) => equipmentLabel(item.equipmentNormalized)))];
      const sameEquipment = equipment.length === 1;
      const plates = items
        .map((item) => {
          const plate = cl(item.plateOriginal) || "—";
          return sameEquipment ? plate : plate + " (" + equipmentLabel(item.equipmentNormalized) + ")";
        })
        .join(" | ");
      const dates = [...new Set(items.map((item) => getDataHora(item) || "—"))].join(" | ");
      const addresses = [...new Set(items.map((item) => cl(item.fullAddress)).filter(Boolean))];
      const mapsLinks = [...new Set(items.map((item) => item.addressLink).filter(Boolean))];
      return [
        (items.length > 1 ? "*Placas:* " : "*Placa:* ") + plates,
        (sameEquipment ? "*Instalação de:* " : "*Instalações:* ") + equipment.join(" | "),
        "*Data e horário:* " + dates,
        ...(addresses.length === 1
          ? ["*Endereço:* " + addresses[0]]
          : addresses.map((address) => "• *Endereço:* " + address)),
        ...mapsLinks.map((link) => "*Mapa:* " + link),
        "*Condutor:* " + contact.name,
        "*Contato:* " + contact.phone,
      ].join("\n");
    });

    const hideGreetingName =
      normalizedKey(technicianName).includes("viniciusaraujo") ||
      [...grouped.values()].some(({ contact }) => normalizedKey(contact.name).includes("davidcomin"));
    return [
      greeting + (hideGreetingName ? "!" : ", " + techName + "!") + " " + confirmation,
      ...details,
    ].join("\n\n");
  }

  function openReminderMessage(technicianName: string, servicesForReminder: ConfirmedService[]) {
    const technician = findTechByName(technicianName);
    const text = buildReminderMessage(servicesForReminder, technicianName);
    if (!text) return;
    setMessageTech({
      tech: technician || {
        firstName: technicianName.split(/\s+/)[0] || "Técnico",
        nameOriginal: technicianName,
      } as typeof technicians[number],
      text,
      phone: phoneForTech(technician, technicianName),
    });
  }

  function handleOpenWhatsApp() {
    if (selectedTechFilter === "all") {
      toast.error("Selecione um técnico específico para enviar WhatsApp.");
      return;
    }
    const tech = selectedTechObj;
    const techName = resolveTechName(selectedTechFilter);
    const text = reminderScheduling ? buildReminderMessage() : buildMessageText();
    if (!text) {
      const date = dateKey(reminderTarget);
      toast.error("Nenhum atendimento AGENDADO foi encontrado para " + date + ".");
      return;
    }
    setMessageTech({
      tech: tech || { firstName: techName, nameOriginal: techName } as typeof technicians[number],
      text,
      phone: phoneForTech(tech, techName),
    });
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Agendamentos</h1>
        <p className="text-muted-foreground mt-1">
          Visualize e gerencie os atendimentos do "Cliente com endereço" por técnico e status.
          O telefone do técnico vem do "Contatar aos técnicos".
        </p>
      </div>

      {services.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhum dado encontrado. Importe "Cliente com endereço" e "Contatar aos técnicos" para começar.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Filter className="w-4 h-4" />
                Filtros
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Técnico(a)</Label>
                <Select value={selectedTechFilter} onValueChange={setSelectedTechFilter}>
                  <SelectTrigger className="w-72">
                    <SelectValue placeholder="Todos os técnicos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os técnicos</SelectItem>
                    {uniqueTechOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select value={selectedStatusFilter} onValueChange={setSelectedStatusFilter}>
                  <SelectTrigger className="w-56">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {uniqueStatusOptions.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedTechFilter("all");
                    setSelectedStatusFilter("all");
                  }}
                >
                  Limpar filtros
                </Button>
                <label className="flex items-center gap-1 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeAgendando}
                    onChange={(e) => {
                      setIncludeAgendando(e.target.checked);
                      if (e.target.checked) setReminderScheduling(false);
                    }}
                    className="accent-primary"
                  />
                  Incluir AGENDANDO
                </label>
                <label className="flex items-center gap-1 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={reminderScheduling}
                    onChange={(e) => {
                      setReminderScheduling(e.target.checked);
                      if (e.target.checked) setIncludeAgendando(false);
                    }}
                    className="accent-primary"
                  />
                  Lembrete agendamento
                </label>
                {selectedTechFilter !== "all" && (
                  <>
                    <Button onClick={handleOpenWhatsApp}>
                      <MessageCircle className="w-4 h-4 mr-2" /> WhatsApp
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {!(reminderScheduling && selectedTechFilter === "all") && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarDays className="w-4 h-4" />
                Agendado{selectedTechFilter !== "all" ? ` — ${resolveTechName(selectedTechFilter)}` : ""}
                <Badge variant="outline">{filteredServices.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm border-collapse border table-fixed">
                <thead>
                  <tr className="text-left text-muted-foreground bg-muted/30">
                    <th className="py-2 px-3 font-medium border w-[130px]">STATUS</th>
                    <th className="py-2 px-3 font-medium border w-[130px]">DATA E HORA</th>
                    <th className="py-2 px-3 font-medium border w-[110px]">PLACA</th>
                    <th className="py-2 px-3 font-medium border">ENDEREÇO COMPLETO PARA ATENDIMENTO</th>
                    <th className="py-2 px-3 font-medium border w-[160px]">TÉCNICO(A)</th>
                    <th className="py-2 px-3 font-medium border w-[120px]">EQUIP</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredServices.map((svc) => (
                    <tr key={svc.id}>
                      <td className="py-2 px-3 border">
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-semibold break-words leading-tight flex-1">
                            {getStatusDisplay(svc)}
                          </span>
                          <Select
                            value={getEffectiveStatus(svc)}
                            onValueChange={(v) => {
                              setStatusOverrides((prev) => ({
                                ...prev,
                                [svc.id]: v as (typeof STATUS_OPTIONS)[number],
                              }));
                            }}
                          >
                            <SelectTrigger className="h-5 w-12 p-0 text-[8px] shrink-0">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STATUS_OPTIONS.map((opt) => (
                                <SelectItem key={opt} value={opt} className="text-xs">
                                  {opt}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </td>
                      <td className="py-2 px-3 border whitespace-nowrap text-xs">
                        {getDataHora(svc) || "—"}
                      </td>
                      <td className="py-2 px-3 border font-mono text-xs whitespace-nowrap">
                        {cl(svc.plateOriginal) || "—"}
                      </td>
                      <td className="py-2 px-3 border break-words text-xs">
                        {cl(svc.fullAddress) || "—"}
                      </td>
                      <td className="py-2 px-3 border truncate max-w-[160px]" title={cl(svc.technicianOriginal) || "—"}>
                        {cl(svc.technicianOriginal) || "—"}
                        {techMap.byName.has(cl(svc.technicianOriginal).toLowerCase()) && (
                          <span className="ml-1 text-[10px] text-green-600">✓</span>
                        )}
                      </td>
                      <td className="py-2 px-3 border whitespace-nowrap">
                        {equipmentLabel(svc.equipmentNormalized)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredServices.length === 0 && (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Nenhum atendimento encontrado com os filtros atuais.
                </p>
              )}
            </CardContent>
          </Card>
          )}

          {hiddenTechs.size > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base text-muted-foreground">
                  Técnicos removidos ({hiddenTechs.size})
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {[...hiddenTechs].map((name) => (
                  <Badge key={name} variant="secondary" className="gap-2">
                    {name}
                    <button
                      className="text-xs hover:text-primary ml-1"
                      onClick={() => {
                        const next = new Set(hiddenTechs);
                        next.delete(name);
                        setHiddenTechs(next);
                      }}
                    >
                      restaurar
                    </button>
                  </Badge>
                ))}
              </CardContent>
            </Card>
          )}

          {reminderScheduling && (
            <section className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Lembretes para {dateKey(reminderTarget)}</h2>
                <p className="text-sm text-muted-foreground">
                  Atendimentos AGENDADOS do próximo dia útil, separados por técnico.
                </p>
              </div>
              {reminderGroups.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-sm text-muted-foreground">
                    Nenhum lembrete encontrado para a próxima data.
                  </CardContent>
                </Card>
              ) : (
                reminderGroups.map((group) => (
                  <Card key={group.key}>
                    <CardHeader className="flex flex-row items-center justify-between gap-4">
                      <CardTitle className="text-base flex items-center gap-2">
                        <CalendarDays className="w-4 h-4" />
                        Lembrete — {group.technicianName}
                        <Badge variant="outline">{group.items.length}</Badge>
                      </CardTitle>
                      <Button onClick={() => openReminderMessage(group.technicianName, group.items)}>
                        <MessageCircle className="w-4 h-4 mr-2" /> WhatsApp
                      </Button>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-1">
                        {group.items.map((service) => (
                          <li key={service.id} className="text-sm py-2 border-b last:border-0">
                            <span className="font-mono text-xs font-semibold">{cl(service.plateOriginal) || "—"}</span>
                            <span className="text-muted-foreground">
                              {" "}— {getDataHora(service) || "sem data"} — {cl(service.fullAddress) || "Endereço não informado"}
                            </span>
                            <Badge variant="secondary" className="ml-2 text-[10px]">
                              {equipmentLabel(service.equipmentNormalized)}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ))
              )}
            </section>
          )}

          {selectedTechFilter !== "all" && includeAgendando && (
          <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarDays className="w-4 h-4" />
                  AGENDANDO
                </CardTitle>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    const name = resolveTechName(selectedTechFilter).toLowerCase().trim();
                    setHiddenTechs((prev) => new Set(prev).add(name));
                    setSelectedTechFilter("all");
                    toast.success("Técnico removido da lista.");
                  }}
                >
                  Remover técnico
                </Button>
              </CardHeader>
              <CardContent>
                {(() => {
                  const agendando = selectedTechFilter === "all" ? [] : services.filter(s => {
                    const name = s.technicianOriginal?.toLowerCase().trim();
                    return !(name && hiddenTechs.has(name)) && filterByTech(s, selectedTechFilter) && getEffectiveStatus(s) === "AGENDANDO";
                  });
                  return agendando.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Nenhum atendimento com status AGENDANDO.
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {agendando.map((svc) => (
                        <li key={svc.id} className="text-sm py-1 border-b last:border-0">
                          <span className="font-mono text-xs font-semibold">
                            {svc.plateOriginal || "—"}
                          </span>
                          <span className="text-muted-foreground">
                            {" "}— {getDataHora(svc) || "sem data"} — {svc.fullAddress}
                          </span>
                          <Badge variant="secondary" className="ml-2 text-[10px]">
                            {equipmentLabel(svc.equipmentNormalized)}
                          </Badge>
                        </li>
                      ))}
                  </ul>
                )})()}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {messageTech && (
        <MessageDialog
          open={messageTech !== null}
          onOpenChange={(v) => !v && setMessageTech(null)}
          message={messageTech.text}
          phone={messageTech.phone}
          title={`Mensagem para ${messageTech.tech.firstName || messageTech.tech.nameOriginal}`}
        />
      )}
    </div>
  );
}
