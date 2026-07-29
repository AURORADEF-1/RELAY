import { z } from "zod";

const nullableText = z.union([z.string(), z.number()]).nullish().transform((value) =>
  value === null || value === undefined || String(value).trim() === ""
    ? null
    : String(value).trim(),
);

const requiredText = nullableText.transform((value) => value ?? "");

const nullableNumber = z.union([z.number(), z.string()]).nullish().transform((value, context) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    context.addIssue({ code: "custom", message: "Expected a numeric value." });
    return z.NEVER;
  }
  return parsed;
});

const numberWithDefault = (fallback: number) =>
  nullableNumber.transform((value) => value ?? fallback);

const booleanValue = z.union([z.boolean(), z.number(), z.string()]).nullish().transform((value) =>
  value === true || value === 1 || value === "1" || value === "true",
);

export const ricoFleetUnitSchema = z.object({
  position: nullableNumber,
  serialNumber: nullableText,
  fleetNumber: nullableText,
  currentHours: nullableNumber,
}).passthrough();

export const ricoFleetMachineSchema = z.object({
  id: requiredText,
  machineRef: requiredText,
  label: requiredText,
  manufacturer: requiredText,
  model: requiredText,
  type: nullableText,
  engine: nullableText,
  // Fleet Manager uses both plain years and ranges such as "2016->".
  year: nullableText,
  serialNumber: nullableText,
  fleetNumber: nullableText,
  quantity: numberWithDefault(1),
  currentHours: nullableNumber,
  serviceIntervalHours: nullableNumber,
  serviceIntervalMonths: nullableNumber,
  imageUrl: nullableText,
  filterCount: numberWithDefault(0),
  units: z.array(ricoFleetUnitSchema).optional().default([]),
  updatedAt: nullableText,
}).passthrough();

export const ricoFleetFilterSchema = z.object({
  partNumber: requiredText,
  description: requiredText,
  filterType: nullableText,
  category: nullableText,
  quantity: numberWithDefault(1),
  bin: nullableText,
  isOem: booleanValue,
  verified: booleanValue,
  price: nullableNumber,
  priceSource: nullableText,
  freeStock: nullableNumber,
  manufacturerStock: nullableNumber,
  inCatalogue: booleanValue,
  catalogueDescription: nullableText,
  imageUrl: nullableText,
}).passthrough();

export const ricoFleetOilSchema = z.object({
  partNumber: requiredText,
  oilType: nullableText,
  applicationArea: nullableText,
  grade: nullableText,
  quantity: nullableText,
  unit: nullableText,
  price: nullableNumber,
  freeStock: nullableNumber,
  inCatalogue: booleanValue,
}).passthrough();

export const ricoFleetKitComponentSchema = z.object({
  partNumber: requiredText,
  description: requiredText,
}).passthrough();

export const ricoFleetKitSchema = z.object({
  kitPartNumber: requiredText,
  serviceInterval: nullableText,
  coverage: nullableText,
  source: nullableText,
  price: nullableNumber,
  priceSource: nullableText,
  freeStock: nullableNumber,
  inCatalogue: booleanValue,
  filters: z.array(ricoFleetKitComponentSchema).optional().default([]),
}).passthrough();

export const ricoFleetListResponseSchema = z.object({
  ok: z.boolean(),
  customer: requiredText,
  total: numberWithDefault(0),
  count: numberWithDefault(0),
  offset: numberWithDefault(0),
  machines: z.array(ricoFleetMachineSchema).optional().default([]),
}).passthrough();

export const ricoFleetMachineResponseSchema = z.object({
  ok: z.boolean(),
  customer: requiredText,
  machine: ricoFleetMachineSchema,
  units: z.array(ricoFleetUnitSchema).optional().default([]),
  filters: z.array(ricoFleetFilterSchema).optional().default([]),
  oils: z.array(ricoFleetOilSchema).optional().default([]),
  kits: z.array(ricoFleetKitSchema).optional().default([]),
}).passthrough();

export const ricoFleetPartSchema = ricoFleetFilterSchema.extend({
  machines: numberWithDefault(0),
  totalQuantity: numberWithDefault(0),
});

export const ricoFleetPartsResponseSchema = z.object({
  ok: z.boolean(),
  customer: requiredText,
  count: numberWithDefault(0),
  parts: z.array(ricoFleetPartSchema).optional().default([]),
  oils: z.array(ricoFleetOilSchema).optional().default([]),
}).passthrough();
