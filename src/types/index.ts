export type PhoneStatus = "valid" | "invalid" | "empty";

export interface PhoneNormalizationResult {
  primary: string | null;
  all: string[];
  status: PhoneStatus;
  reason?: string;
}

export interface InitialContact {
  id: string;
  plateOriginal: string;
  plateNormalized: string;
  responsibleOriginal: string;
  matrixOriginal?: string;
  firstName: string;
  phoneOriginal: string;
  phoneNormalized: string | null;
  allPhones: string[];
  plates: string[];
  rowNumbers: number[];
  validationIssues: string[];
  alternativeNames?: string[];
}

export type EquipmentType = "S8_ECO" | "S8_ECO_G5_PLUS" | "NAO_IDENTIFICADO";

export type ServiceStatus = "AGENDAR" | "AGENDANDO" | "AGENDADO" | "FINALIZADO" | "";

export interface EquipmentBreakdown {
  s8EcoSets: number;
  g5PlusSets: number;
  totalKits: number;
  removals: number;
  hasG5Plus: boolean;
  rawDescription: string;
}

export interface ConfirmedService {
  id: string;
  plateOriginal: string;
  plateNormalized: string;
  responsibleOriginal: string;
  matrizOriginal?: string;
  firstName: string;
  phoneOriginal: string;
  phoneNormalized: string | null;
  fullAddress: string;
  addressLink?: string;
  cityDetected: string | null;
  stateDetected: string | null;
  equipmentOriginal: string;
  equipmentNormalized: EquipmentType;
  technicianOriginal?: string;
  technicianNormalized?: string;
  serviceStatus?: ServiceStatus;
  serviceStatusOriginal?: string;
  dataHora?: string;
  observationsOriginal?: string;
  validationIssues: string[];
}

export type TechnicianStockStatus =
  "DISPONIVEL" | "SEM_MATERIAL" | "CONFIRMAR" | "NAO_INFORMADO" | "TEXTO_NAO_INTERPRETADO";

export interface Technician {
  id: string;
  nameOriginal: string;
  firstName: string;
  phoneOriginal: string;
  phoneNormalized: string | null;
  allPhones: string[];
  cityOriginal: string;
  cityNormalized: string;
  state: string;
  quantityOriginal: string;
  availableQuantity: number | null;
  stockStatus: TechnicianStockStatus;
  equipmentBreakdown?: EquipmentBreakdown | null;
  validationIssues: string[];
  address?: string;
  addressLat?: number;
  addressLng?: number;
  /** CNPJ (razão social) informado no cadastro via Supabase. */
  cnpj?: string;
  /** Endereço cru (logradouro) como digitado/importado, sem nº/bairro/cidade. */
  addressOriginal?: string;
}

export interface Assignment {
  serviceId: string;
  technicianId: string;
  scheduledDate?: string;
  scheduledTime?: string;
  notes?: string;
}

export interface ServiceCall {
  id: string;
  chamadoOriginal: string;
  plateOriginal: string;
  plateNormalized: string;
  equipmentOriginal: string;
  equipmentNormalized: EquipmentType;
  atendenteOriginal?: string;
  fatOriginal?: string;
  validationIssues: string[];
}

export type FieldKey =
  | "plate"
  | "responsible"
  | "phone"
  | "matrix"
  | "address"
  | "equipment"
  | "technician"
  | "city"
  | "state"
  | "quantity"
  | "status"
  | "dataHora"
  | "observations"
  | "chamado"
  | "atendente"
  | "fat";

export interface ImportDiagnostic {
  fileName: string;
  sheetName?: string;
  headerRow: number;
  columnsFound: string[];
  columnsMapped: Partial<Record<FieldKey, string>>;
  columnsUnmapped: string[];
  rowsImported: number;
  rowsSkipped: number;
  invalidPhones: number;
  emptyPlates: number;
  emptyNames: number;
  emptyAddresses: number;
  equipmentUnknown: number;
  quantityUnparsed: number;
  groupedContacts: number;
  nameConflicts: number;
  timestamp: number;
}

export type ImportKind = "initial" | "confirmed" | "technicians" | "calls";

export type ParsedRow = Record<string, string>;
