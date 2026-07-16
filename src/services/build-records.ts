import type {
  ConfirmedService,
  FieldKey,
  ImportDiagnostic,
  InitialContact,
  Technician,
} from "@/types";
import { normalizeBrazilianPhone } from "@/utils/normalize-phone";
import { extractFirstName } from "@/utils/extract-first-name";
import { normalizePlate } from "@/utils/normalize-text";
import { normalizeEquipment } from "@/utils/normalize-equipment";
import { extractCityAndStateFromAddress } from "@/utils/extract-location";
import { parseTechnicianQuantity, stripQuantityFormat } from "@/utils/parse-quantity";
import { parseEquipmentQuantity } from "@/utils/parse-equipment-quantity";
import { normalizeText } from "@/utils/normalize-text";

let idCounter = 0;
const uid = () => `${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

const BUILD_DEBUG = true;

function debugBuild(label: string, data: unknown) {
  if (!BUILD_DEBUG) return;
  console.log(`[BUILD DEBUG] ${label}`, JSON.stringify(data, null, 2));
}

export interface BuildResult<T> {
  records: T[];
  diagnostic: Omit<ImportDiagnostic, "fileName" | "sheetName" | "timestamp">;
}

function getField(
  row: Record<string, string>,
  mapping: Partial<Record<FieldKey, string>>,
  key: FieldKey,
): string {
  const col = mapping[key];
  if (!col) return "";
  return row[col] ?? "";
}

export function buildInitialContacts(
  rows: Record<string, string>[],
  mapping: Partial<Record<FieldKey, string>>,
  headerRow: number,
): BuildResult<InitialContact> {
  debugBuild("initial:start", {
    totalRows: rows.length,
    mapping,
    headerRow,
    sampleRows: rows.slice(0, 5),
  });
  const diagBase = {
    headerRow,
    columnsFound: Object.keys(rows[0] ?? {}),
    columnsMapped: mapping,
    columnsUnmapped: [],
    rowsImported: 0,
    rowsSkipped: 0,
    invalidPhones: 0,
    emptyPlates: 0,
    emptyNames: 0,
    emptyAddresses: 0,
    equipmentUnknown: 0,
    quantityUnparsed: 0,
    groupedContacts: 0,
    nameConflicts: 0,
  };

  const byPhone = new Map<string, InitialContact>();
  const invalidList: InitialContact[] = [];
  const recordsInOrder: InitialContact[] = [];
  let imported = 0;
  let skipped = 0;
  let invalid = 0;
  let emptyPlates = 0;
  let emptyNames = 0;

  rows.forEach((row, idx) => {
    const plateRaw = getField(row, mapping, "plate");
    const respRaw = getField(row, mapping, "responsible");
    const phoneRaw = getField(row, mapping, "phone");
    const matrixRaw = getField(row, mapping, "matrix");
    debugBuild("initial:row:raw-fields", {
      index: idx,
      spreadsheetRow: idx + headerRow + 2,
      row,
      plateRaw,
      respRaw,
      phoneRaw,
      matrixRaw,
      mapping,
    });
    if (!plateRaw && !respRaw && !phoneRaw) {
      skipped++;
      debugBuild("initial:row:skipped-empty", { index: idx, row });
      return;
    }
    if (!plateRaw) emptyPlates++;
    if (!respRaw) emptyNames++;
    const phoneResult = normalizeBrazilianPhone(phoneRaw);
    const firstName = extractFirstName(respRaw);
    const plateNorm = normalizePlate(plateRaw);
    const issues: string[] = [];
    if (!plateRaw) issues.push("Placa vazia");
    if (!respRaw) issues.push("Responsável vazio");
    if (phoneResult.status !== "valid") {
      invalid++;
      issues.push(phoneResult.reason ?? "Telefone vazio");
    }
    imported++;

    debugBuild("initial:row:normalized", {
      index: idx,
      spreadsheetRow: idx + headerRow + 2,
      plateRaw,
      plateNorm,
      respRaw,
      firstName,
      phoneRaw,
      matrixRaw,
      phoneResult,
      issues,
    });

    if (phoneResult.status === "valid" && phoneResult.primary) {
      const key = phoneResult.primary;
      const existing = byPhone.get(key);
      if (existing) {
        debugBuild("initial:row:grouped-by-phone", {
          index: idx,
          phoneKey: key,
          existing,
          incoming: { plateRaw, respRaw, firstName, phoneRaw, matrixRaw },
        });
        if (plateRaw && !existing.plates.includes(plateRaw)) {
          existing.plates.push(plateRaw);
        }
        existing.rowNumbers.push(idx + headerRow + 2);
        if (firstName && firstName !== existing.firstName) {
          existing.alternativeNames = existing.alternativeNames ?? [];
          if (!existing.alternativeNames.includes(firstName)) {
            existing.alternativeNames.push(firstName);
          }
        }
        for (const iss of issues)
          if (!existing.validationIssues.includes(iss)) existing.validationIssues.push(iss);
        if (matrixRaw && !existing.matrixOriginal) {
          existing.matrixOriginal = matrixRaw;
        }
      } else {
        debugBuild("initial:row:create-valid-contact", {
          index: idx,
          phoneKey: key,
          plateRaw,
          respRaw,
          phoneRaw,
          matrixRaw,
        });
        const contact: InitialContact = {
          id: uid(),
          plateOriginal: plateRaw,
          plateNormalized: plateNorm,
          responsibleOriginal: respRaw,
          matrixOriginal: matrixRaw,
          firstName,
          phoneOriginal: phoneRaw,
          phoneNormalized: phoneResult.primary,
          allPhones: phoneResult.all,
          plates: plateRaw ? [plateRaw] : [],
          rowNumbers: [idx + headerRow + 2],
          validationIssues: issues,
          alternativeNames: [],
        };
        byPhone.set(key, contact);
        recordsInOrder.push(contact);
      }
    } else {
      debugBuild("initial:row:create-invalid-contact", {
        index: idx,
        plateRaw,
        respRaw,
        phoneRaw,
        matrixRaw,
        phoneResult,
        issues,
      });
      const contact: InitialContact = {
        id: uid(),
        plateOriginal: plateRaw,
        plateNormalized: plateNorm,
        responsibleOriginal: respRaw,
        matrixOriginal: matrixRaw,
        firstName,
        phoneOriginal: phoneRaw,
        phoneNormalized: null,
        allPhones: phoneResult.all,
        plates: plateRaw ? [plateRaw] : [],
        rowNumbers: [idx + headerRow + 2],
        validationIssues: issues,
      };
      invalidList.push(contact);
      recordsInOrder.push(contact);
    }
  });

  const grouped = Array.from(byPhone.values());
  const nameConflicts = grouped.filter((c) => (c.alternativeNames?.length ?? 0) > 0).length;
  const records = recordsInOrder;
  debugBuild("initial:end", {
    imported,
    skipped,
    invalid,
    emptyPlates,
    emptyNames,
    validRecords: grouped.length,
    invalidRecords: invalidList.length,
    invalidList,
    records,
  });
  return {
    records,
    diagnostic: {
      ...diagBase,
      rowsImported: imported,
      rowsSkipped: skipped,
      invalidPhones: invalid,
      emptyPlates,
      emptyNames,
      groupedContacts: grouped.filter((g) => g.plates.length > 1).length,
      nameConflicts,
    },
  };
}

export function buildConfirmedServices(
  rows: Record<string, string>[],
  mapping: Partial<Record<FieldKey, string>>,
  headerRow: number,
): BuildResult<ConfirmedService> {
  const records: ConfirmedService[] = [];
  let imported = 0;
  let skipped = 0;
  let invalidPhones = 0;
  let emptyPlates = 0;
  let emptyNames = 0;
  let emptyAddresses = 0;
  let equipmentUnknown = 0;

  rows.forEach((row) => {
    const plateRaw = getField(row, mapping, "plate");
    const respRaw = getField(row, mapping, "responsible");
    const matrixRaw = getField(row, mapping, "matrix");
    const phoneRaw = getField(row, mapping, "phone");
    const addressRaw = getField(row, mapping, "address");
    const equipmentRaw = getField(row, mapping, "equipment");
    const technicianRaw = getField(row, mapping, "technician");
    const statusRaw = getField(row, mapping, "status");
    const dataHoraRaw = getField(row, mapping, "dataHora");
    if (!plateRaw && !respRaw && !phoneRaw && !addressRaw) {
      skipped++;
      return;
    }
    const phoneResult = normalizeBrazilianPhone(phoneRaw);
    const eq = normalizeEquipment(equipmentRaw);
    const loc = extractCityAndStateFromAddress(addressRaw);
    const issues: string[] = [];
    if (!plateRaw) {
      issues.push("Placa vazia");
      emptyPlates++;
    }
    if (!respRaw) {
      issues.push("Responsável vazio");
      emptyNames++;
    }
    if (!addressRaw) {
      issues.push("Endereço vazio");
      emptyAddresses++;
    }
    if (eq === "NAO_IDENTIFICADO") {
      issues.push("Equipamento não identificado");
      equipmentUnknown++;
    }
    if (phoneResult.status !== "valid") {
      invalidPhones++;
      issues.push(phoneResult.reason ?? "Telefone vazio");
    }

    const statusNorm = normalizeText(statusRaw);
    let serviceStatus: ConfirmedService["serviceStatus"] = "";
    if (statusNorm === "AGENDADO") serviceStatus = "AGENDADO";
    else if (statusNorm === "AGENDANDO") serviceStatus = "AGENDANDO";
    else if (statusNorm.startsWith("AGENDAR")) serviceStatus = "AGENDAR";

    records.push({
      id: uid(),
      plateOriginal: plateRaw,
      plateNormalized: normalizePlate(plateRaw),
      responsibleOriginal: respRaw,
      matrizOriginal: matrixRaw || undefined,
      firstName: extractFirstName(respRaw),
      phoneOriginal: phoneRaw,
      phoneNormalized: phoneResult.primary,
      fullAddress: addressRaw,
      cityDetected: loc.city,
      stateDetected: loc.state,
      equipmentOriginal: equipmentRaw,
      equipmentNormalized: eq,
      technicianOriginal: technicianRaw || undefined,
      technicianNormalized: technicianRaw ? normalizeText(technicianRaw) : undefined,
      serviceStatus,
      serviceStatusOriginal: statusRaw || undefined,
      dataHora: dataHoraRaw || undefined,
      validationIssues: issues,
    });
    imported++;
  });

  return {
    records,
    diagnostic: {
      headerRow,
      columnsFound: Object.keys(rows[0] ?? {}),
      columnsMapped: mapping,
      columnsUnmapped: [],
      rowsImported: imported,
      rowsSkipped: skipped,
      invalidPhones,
      emptyPlates,
      emptyNames,
      emptyAddresses,
      equipmentUnknown,
      quantityUnparsed: 0,
      groupedContacts: 0,
      nameConflicts: 0,
    },
  };
}

export function buildTechnicians(
  rows: Record<string, string>[],
  mapping: Partial<Record<FieldKey, string>>,
  headerRow: number,
): BuildResult<Technician> {
  const records: Technician[] = [];
  let imported = 0;
  let skipped = 0;
  let invalidPhones = 0;
  let quantityUnparsed = 0;

  rows.forEach((row) => {
    const nameRaw = getField(row, mapping, "technician");
    const phoneRaw = getField(row, mapping, "phone");
    const cityRaw = getField(row, mapping, "city");
    const stateRaw = getField(row, mapping, "state");
    const qRaw = getField(row, mapping, "quantity");
    if (!nameRaw && !phoneRaw && !cityRaw) {
      skipped++;
      return;
    }
    const phoneResult = normalizeBrazilianPhone(phoneRaw);
    const qty = parseTechnicianQuantity(qRaw);
    const issues: string[] = [];
    if (!nameRaw) issues.push("Nome vazio");
    if (!cityRaw) issues.push("Cidade vazia");
    if (!stateRaw) issues.push("UF vazia");
    if (phoneResult.status !== "valid") {
      invalidPhones++;
      issues.push(phoneResult.reason ?? "Telefone vazio");
    }
    if (qty.status === "TEXTO_NAO_INTERPRETADO") quantityUnparsed++;

    const eqBreakdown = parseEquipmentQuantity(qRaw);

    records.push({
      id: uid(),
      nameOriginal: nameRaw,
      firstName: extractFirstName(nameRaw),
      phoneOriginal: phoneRaw,
      phoneNormalized: phoneResult.primary,
      allPhones: phoneResult.all,
      cityOriginal: cityRaw,
      cityNormalized: cityRaw.trim(),
      state: stateRaw.trim().toUpperCase(),
      quantityOriginal: stripQuantityFormat(qRaw),
      availableQuantity: qty.quantity,
      stockStatus: qty.status,
      equipmentBreakdown: eqBreakdown,
      validationIssues: issues,
    });
    imported++;
  });

  return {
    records,
    diagnostic: {
      headerRow,
      columnsFound: Object.keys(rows[0] ?? {}),
      columnsMapped: mapping,
      columnsUnmapped: [],
      rowsImported: imported,
      rowsSkipped: skipped,
      invalidPhones,
      emptyPlates: 0,
      emptyNames: 0,
      emptyAddresses: 0,
      equipmentUnknown: 0,
      quantityUnparsed,
      groupedContacts: 0,
      nameConflicts: 0,
    },
  };
}
