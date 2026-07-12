import type { ConfirmedService, InitialContact, Technician } from "@/types";
import { equipmentLabel } from "@/utils/normalize-equipment";
import { getGreetingByCurrentTime } from "@/utils/greeting";

export interface MessageTemplates {
  responsibleSingle: string;
  responsibleMultiple: string;
  technicianSingle: string;
  technicianMultiple: string;
}

export const DEFAULT_TEMPLATES: MessageTemplates = {
  responsibleSingle: `Olá, {saudacao}, {primeiro_nome}!
Meu nome é Matheus, trabalho na Creare Sistemas.
Gostaria de verificar contigo se o veículo de placa {placa} é de sua responsabilidade.
Se sim, poderia, por gentileza, confirmar os seguintes dados para agendarmos a instalação da telemetria e do videomonitoramento?
• Endereço completo da instalação:
• Data:
• Horário disponível:
Até mais!`,
  responsibleMultiple: `Olá, {saudacao}, {primeiro_nome}!
Meu nome é Matheus, trabalho na Creare Sistemas.
Gostaria de verificar contigo se os veículos das placas abaixo são de sua responsabilidade:
{placas}
Se sim, poderia, por gentileza, confirmar os seguintes dados para agendarmos a instalação da telemetria e do videomonitoramento?
• Endereço completo da instalação:
• Data:
• Horário disponível:
Até mais!`,
  technicianSingle: `Olá, {saudacao}, {primeiro_nome_tecnico}!
Meu nome é Matheus, trabalho na Creare Sistemas e gostaria de verificar contigo a disponibilidade para realizar uma instalação de {equipamento}.

Veículo/placa: {placa}
Cidade/UF: {cidade}/{uf}
Data: {data}
Horário: {horario}

Você possui disponibilidade e o equipamento necessário para realizar esse atendimento?`,
  technicianMultiple: `Olá, {saudacao}, {primeiro_nome_tecnico}!
Meu nome é Matheus, trabalho na Creare Sistemas e gostaria de verificar contigo a disponibilidade para os seguintes atendimentos:

{atendimentos}

Você possui disponibilidade e os equipamentos necessários para realizar esses atendimentos?`,
};

const STORAGE_KEY = "creare_message_templates";

const OLD_RESPONSIBLE_SINGLE = `Olá, {saudacao}, {primeiro_nome}!
Meu nome é Matheus, trabalho na Creare Sistemas.
Gostaria de verificar contigo se o veículo de placa {placa} é de sua responsabilidade.
Se sim, poderia, por gentileza, confirmar os seguintes dados para agendarmos a instalação da telemetria e do videomonitoramento?
• Endereço completo da instalação;
• Data disponível;
• Horário disponível.
Até mais!`;

const OLD_RESPONSIBLE_MULTIPLE = `Olá, {saudacao}, {primeiro_nome}!
Meu nome é Matheus, trabalho na Creare Sistemas.
Gostaria de verificar contigo se os veículos das placas abaixo são de sua responsabilidade:
{placas}
Se sim, poderia, por gentileza, confirmar os seguintes dados para agendarmos a instalação da telemetria e do videomonitoramento?
• Endereço completo da instalação;
• Data disponível;
• Horário disponível.
Até mais!`;

export function loadTemplates(): MessageTemplates {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TEMPLATES;
    const parsed = JSON.parse(raw) as Partial<MessageTemplates>;
    if (parsed.responsibleSingle === OLD_RESPONSIBLE_SINGLE) {
      parsed.responsibleSingle = DEFAULT_TEMPLATES.responsibleSingle;
    }
    if (parsed.responsibleMultiple === OLD_RESPONSIBLE_MULTIPLE) {
      parsed.responsibleMultiple = DEFAULT_TEMPLATES.responsibleMultiple;
    }
    return { ...DEFAULT_TEMPLATES, ...parsed };
  } catch {
    return DEFAULT_TEMPLATES;
  }
}

export function saveTemplates(t: MessageTemplates): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
  } catch {
    /* ignore */
  }
}

export function buildResponsibleMessage(
  contact: InitialContact,
  templates: MessageTemplates = loadTemplates(),
  overrideName?: string,
  greeting: string = getGreetingByCurrentTime(),
): string {
  const name = overrideName ?? contact.firstName ?? "";
  const nameOrHello = name || "tudo bem?";
  const plates =
    contact.plates.length > 0 ? contact.plates : [contact.plateOriginal].filter(Boolean);
  if (plates.length <= 1) {
    return templates.responsibleSingle
      .replaceAll("{saudacao}", greeting)
      .replaceAll("{primeiro_nome}", nameOrHello)
      .replaceAll("{placa}", plates[0] ?? "");
  }
  const list = plates.map((p) => `• ${p}`).join("\n");
  return templates.responsibleMultiple
    .replaceAll("{saudacao}", greeting)
    .replaceAll("{primeiro_nome}", nameOrHello)
    .replaceAll("{placas}", list);
}

export interface TechnicianMessageContext {
  service: ConfirmedService;
  scheduledDate?: string;
  scheduledTime?: string;
}

export function buildTechnicianMessage(
  technician: Technician,
  ctx: TechnicianMessageContext,
  templates: MessageTemplates = loadTemplates(),
  greeting: string = getGreetingByCurrentTime(),
): string {
  const name = technician.firstName || "tudo bem?";
  const s = ctx.service;
  return templates.technicianSingle
    .replaceAll("{saudacao}", greeting)
    .replaceAll("{primeiro_nome_tecnico}", name)
    .replaceAll("{equipamento}", equipmentLabel(s.equipmentNormalized))
    .replaceAll("{placa}", s.plateOriginal || "-")
    .replaceAll("{cidade}", s.cityDetected || "-")
    .replaceAll("{uf}", s.stateDetected || "-")
    .replaceAll("{data}", ctx.scheduledDate || "A confirmar")
    .replaceAll("{horario}", ctx.scheduledTime || "A confirmar");
}

export function buildGroupedTechnicianMessage(
  technician: Technician,
  ctxs: TechnicianMessageContext[],
  templates: MessageTemplates = loadTemplates(),
  greeting: string = getGreetingByCurrentTime(),
): string {
  const name = technician.firstName || "tudo bem?";
  const seen = new Set<string>();
  const uniqueCtxs = ctxs.filter((c) => {
    if (seen.has(c.service.id)) return false;
    seen.add(c.service.id);
    return true;
  });
  const blocks = uniqueCtxs
    .map((c, i) => {
      const s = c.service;
      return [
        `ATENDIMENTO ${i + 1}`,
        `Equipamento: ${equipmentLabel(s.equipmentNormalized)}`,
        `Placa: ${s.plateOriginal || "-"}`,

        `Cidade/UF: ${s.cityDetected || "-"}/${s.stateDetected || "-"}`,
        `Data: ${c.scheduledDate || "A confirmar"}`,
        `Horário: ${c.scheduledTime || "A confirmar"}`,
      ].join("\n");
    })
    .join("\n\n");
  return templates.technicianMultiple
    .replaceAll("{saudacao}", greeting)
    .replaceAll("{primeiro_nome_tecnico}", name)
    .replaceAll("{atendimentos}", blocks);
}
