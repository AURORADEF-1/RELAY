import type { z } from "zod";
import {
  ricoMachineSchema,
  ricoProductSchema,
} from "@/lib/integrations/rico/schemas";
import type { RicoMachine, RicoProduct } from "@/lib/integrations/rico/types";

type RawProduct = z.infer<typeof ricoProductSchema>;
type RawMachine = z.infer<typeof ricoMachineSchema>;

const machineDescriptionSuffix =
  /\b(?:MIDI|MINI|MICRO|COMPACT|TRACKED|WHEELED|CRAWLER|EXCAVATORS?|DUMPERS?|DUMP\s+TRUCKS?|ROLLERS?|COMPACTORS?|TELEHANDLERS?|LOADALLS?|LOADERS?|FORKLIFTS?|TRACTORS?|TRUCKS?|BREAKERS?|ATTACHMENTS?|CRUSHERS?|SCREENS?|DOZERS?|CRANES?|PLATFORMS?|GENERATORS?)\b.*$/i;

export function normalizeRicoReference(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, " ");
}

export function compactRicoReference(value: string) {
  return normalizeRicoReference(value).replace(/[\s\-_/\\.]+/g, "");
}

export function buildRicoReferenceCandidates(value: string) {
  const exact = normalizeRicoReference(value);
  const compact = compactRicoReference(value);
  return Array.from(new Set([exact, compact].filter(Boolean)));
}

export function buildRicoMachineQueryCandidates(value: string) {
  const exact = extractRicoMachineModel(value);
  const tokens = exact.split(" ");
  const leadingModel = /^[A-Za-z]+$/.test(tokens[0] ?? "") && /^\d/.test(tokens[1] ?? "")
    ? `${tokens[0]} ${tokens[1]}`
    : tokens[0] ?? "";
  const spacedLeadingModel = leadingModel.replace(/([A-Za-z])(?=\d)/g, "$1 ");
  const spaced = exact.replace(/([A-Za-z])(?=\d)/g, "$1 ");
  return Array.from(new Set([
    exact,
    spacedLeadingModel,
    leadingModel,
    spaced,
  ].filter(Boolean)));
}

export function extractRicoMachineModel(value: string, manufacturer?: string | null) {
  let model = value.trim().replace(/\s+/g, " ");
  const make = manufacturer?.trim();
  if (make && model.toUpperCase().startsWith(`${make.toUpperCase()} `)) {
    model = model.slice(make.length).trim();
  }
  return model.replace(machineDescriptionSuffix, "").trim() || model;
}

export function getRicoServiceIntervalHours(kitType?: string | null) {
  const normalized = kitType?.trim().toLowerCase().replace(/\s+/g, " ");
  if (normalized === "air/oil/fuel") return 500;
  if (normalized === "full kit") return 1000;
  return null;
}

function decodeRicoHtml(value: string) {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#(?:39|x27);/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function plainTextFromHtml(value: string) {
  return decodeRicoHtml(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function descriptionItemsFromHtml(value: string) {
  return decodeRicoHtml(value)
    .replace(/<(?:br\s*\/?|\/p|\/li|\/div|\/tr)>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .split(/\n+/)
    .map((item) => item.replace(/\s+/g, " ").replace(/^[•\-–—]\s*/, "").trim())
    .filter(Boolean);
}

export function normalizeRicoProduct(product: RawProduct): RicoProduct {
  return {
    id: product.id,
    reference: product.reference.trim(),
    name: product.name.trim(),
    descriptionShort: product.description_short
      ? plainTextFromHtml(product.description_short) || null
      : null,
    descriptionItems: product.description_short
      ? descriptionItemsFromHtml(product.description_short)
      : [],
    price: product.price,
    quantity: Math.trunc(product.quantity),
    manufacturerId: product.id_manufacturer,
    manufacturerName: product.manufacturer_name?.trim() || null,
    categoryId: product.id_category_default,
    ean13: product.ean13?.trim() || null,
    active: product.active,
    dateAdded: product.date_add?.trim() || null,
    dateUpdated: product.date_upd?.trim() || null,
    commodityCode: product.commodity_code?.trim() || null,
    countryOfOrigin: product.country_of_origin?.trim() || null,
    features: product.features.map((feature) => ({
      name: feature.name.trim(),
      value: feature.value.trim(),
    })),
    images: product.images,
    matchedCrossReference: product.matched_crossref?.trim() || null,
  };
}

export function normalizeRicoMachine(machine: RawMachine): RicoMachine {
  return {
    machineId: machine.machine_id,
    manufacturer: machine.manufacturer.trim(),
    model: machine.model.trim(),
    series: machine.series?.trim() || null,
    engine: machine.engine?.trim() || null,
    kits: machine.kits.map(normalizeRicoProduct),
  };
}
