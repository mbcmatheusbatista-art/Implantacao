import type { InitialContact } from "@/types";

export interface InitialContactUpdate {
  plate: string;
  previousResponsible: string;
  nextResponsible: string;
  previousPhone: string;
  nextPhone: string;
}

function contactsByPlate(contacts: InitialContact[]): Map<string, InitialContact> {
  const byPlate = new Map<string, InitialContact>();
  for (const contact of contacts) {
    for (const plate of contact.plates) {
      const normalized = plate.trim().toUpperCase();
      if (normalized) byPlate.set(normalized, contact);
    }
  }
  return byPlate;
}

export function detectInitialContactUpdates(
  previous: InitialContact[],
  next: InitialContact[],
): InitialContactUpdate[] {
  const previousByPlate = contactsByPlate(previous);
  const updates: InitialContactUpdate[] = [];
  const seen = new Set<string>();

  for (const contact of next) {
    for (const plate of contact.plates) {
      const normalized = plate.trim().toUpperCase();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);

      const previousContact = previousByPlate.get(normalized);
      if (!previousContact) continue;

      const previousResponsible = previousContact.responsibleOriginal.trim();
      const nextResponsible = contact.responsibleOriginal.trim();
      const previousPhone = previousContact.phoneNormalized ?? previousContact.phoneOriginal.trim();
      const nextPhone = contact.phoneNormalized ?? contact.phoneOriginal.trim();

      if (previousResponsible !== nextResponsible || previousPhone !== nextPhone) {
        updates.push({
          plate,
          previousResponsible,
          nextResponsible,
          previousPhone,
          nextPhone,
        });
      }
    }
  }

  return updates;
}
