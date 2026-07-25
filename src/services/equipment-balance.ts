import type { ConfirmedService, Technician } from "@/types";
import type { EquipmentBreakdown } from "@/utils/parse-equipment-quantity";

export interface EquipmentBalance {
  technicianId: string;
  technicianName: string;
  inventory: { s8Eco: number; g5Plus: number };
  used: { s8Eco: number; g5Plus: number };
  pending: { s8Eco: number; g5Plus: number };
  available: { s8Eco: number; g5Plus: number };
  assignedServices: {
    service: ConfirmedService;
    needsS8Eco: boolean;
    needsG5Plus: boolean;
  }[];
}

function normalizeForMatch(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function technicianMatches(tech: Technician, serviceTechName: string): boolean {
  const target = normalizeForMatch(serviceTechName);
  if (!target) return false;
  if (normalizeForMatch(tech.nameOriginal).includes(target)) return true;
  if (normalizeForMatch(tech.firstName).includes(target)) return true;
  if (target.includes(normalizeForMatch(tech.firstName))) return true;
  return false;
}

function equipmentNeeds(service: ConfirmedService): { s8Eco: boolean; g5Plus: boolean } {
  return {
    s8Eco: service.equipmentNormalized === "S8_ECO" || service.equipmentNormalized === "S8_ECO_G5_PLUS",
    g5Plus: service.equipmentNormalized === "S8_ECO_G5_PLUS",
  };
}

export function calculateAllBalances(
  technicians: Technician[],
  services: ConfirmedService[],
): Map<string, EquipmentBalance> {
  const balances = new Map<string, EquipmentBalance>();

  for (const tech of technicians) {
    const breakdown = tech.equipmentBreakdown;
    const inv = breakdown
      ? { s8Eco: breakdown.s8EcoSets, g5Plus: breakdown.g5PlusSets }
      : { s8Eco: tech.availableQuantity ?? 0, g5Plus: 0 };

    const assigned: EquipmentBalance["assignedServices"] = [];
    const used = { s8Eco: 0, g5Plus: 0 };
    const pending = { s8Eco: 0, g5Plus: 0 };

    for (const svc of services) {
      if (!svc.technicianNormalized) continue;
      if (!technicianMatches(tech, svc.technicianNormalized)) continue;

      const needs = equipmentNeeds(svc);
      assigned.push({ service: svc, ...needs });

      if (svc.serviceStatus === "AGENDADO") {
        if (needs.s8Eco) used.s8Eco += 1;
        if (needs.g5Plus) used.g5Plus += 1;
      } else if (svc.serviceStatus === "AGENDANDO" || svc.serviceStatus === "AGENDAR") {
        if (needs.s8Eco) pending.s8Eco += 1;
        if (needs.g5Plus) pending.g5Plus += 1;
      }
    }

    balances.set(tech.id, {
      technicianId: tech.id,
      technicianName: tech.nameOriginal,
      inventory: { ...inv },
      used: { ...used },
      pending: { ...pending },
      available: {
        s8Eco: Math.max(0, inv.s8Eco - used.s8Eco - pending.s8Eco),
        g5Plus: Math.max(0, inv.g5Plus - used.g5Plus - pending.g5Plus),
      },
      assignedServices: assigned,
    });
  }

  return balances;
}

export function getTechnicianBalance(
  techId: string,
  balances: Map<string, EquipmentBalance>,
): EquipmentBalance | null {
  return balances.get(techId) ?? null;
}
