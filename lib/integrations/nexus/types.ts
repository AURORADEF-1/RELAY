export type NexusCataloguePart = {
  id: string;
  applicationId: string;
  partNumber: string;
  description: string;
  manufacturer: string;
  model: string;
  subgroup: string;
  verificationStatus:
    | "unverified"
    | "relay_verified"
    | "supplier_verified"
    | "manufacturer_verified";
  stockAvailable: number;
  reorderLevel: number;
  binLocation: string;
  sellPrice: number | null;
  currency: "GBP";
  imageUrl: string | null;
  imageExpiresInSeconds: number | null;
  updatedAt: string;
};

export type NexusCatalogueResponse = {
  manufacturer: string;
  model: string;
  checkedAt: string;
  parts: NexusCataloguePart[];
};

export type NexusAllocationLine = {
  partId: string;
  partNumber: string;
  description: string;
  manufacturer: string;
  requestedQuantity: number;
  issuedQuantity: number;
  shortfallQuantity: number;
  stockBefore: number;
  stockAfter: number;
  binLocation: string;
  sellPrice: number | null;
};

export type NexusAllocationResponse = {
  allocationId: string;
  relayTicketId: string;
  idempotent: boolean;
  createdAt: string;
  lines: NexusAllocationLine[];
};
