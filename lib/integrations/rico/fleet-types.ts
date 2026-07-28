export type RicoFleetUnit = {
  position: number | null;
  serialNumber: string | null;
  fleetNumber: string | null;
  currentHours: number | null;
};

export type RicoFleetMachineSummary = {
  id: string;
  machineRef: string;
  label: string;
  manufacturer: string;
  model: string;
  type: string | null;
  engine: string | null;
  year: number | null;
  serialNumber: string | null;
  fleetNumber: string | null;
  quantity: number;
  currentHours: number | null;
  serviceIntervalHours: number | null;
  serviceIntervalMonths: number | null;
  imageUrl: string | null;
  filterCount: number;
  units: RicoFleetUnit[];
  updatedAt: string | null;
};

export type RicoFleetFilter = {
  partNumber: string;
  description: string;
  filterType: string | null;
  category: string | null;
  quantity: number;
  bin: string | null;
  isOem: boolean;
  verified: boolean;
  price: number | null;
  priceSource: string | null;
  freeStock: number | null;
  manufacturerStock: number | null;
  inCatalogue: boolean;
  catalogueDescription: string | null;
  imageUrl: string | null;
};

export type RicoFleetOil = {
  partNumber: string;
  oilType: string | null;
  applicationArea: string | null;
  grade: string | null;
  quantity: string | null;
  unit: string | null;
  price: number | null;
  freeStock: number | null;
  inCatalogue: boolean;
};

export type RicoFleetKitComponent = {
  partNumber: string;
  description: string;
};

export type RicoFleetKit = {
  kitPartNumber: string;
  serviceInterval: string | null;
  coverage: string | null;
  source: string | null;
  price: number | null;
  priceSource: string | null;
  freeStock: number | null;
  inCatalogue: boolean;
  filters: RicoFleetKitComponent[];
};

export type RicoFleetMachineDetail = {
  customer: string;
  machine: RicoFleetMachineSummary;
  units: RicoFleetUnit[];
  filters: RicoFleetFilter[];
  oils: RicoFleetOil[];
  kits: RicoFleetKit[];
  checkedAt: string;
};

export type RicoFleetMachinePage = {
  customer: string;
  total: number;
  count: number;
  offset: number;
  machines: RicoFleetMachineSummary[];
  checkedAt: string;
};

export type RicoFleetPartsPage = {
  customer: string;
  count: number;
  parts: Array<RicoFleetFilter & { machines: number; totalQuantity: number }>;
  oils: RicoFleetOil[];
  checkedAt: string;
};
