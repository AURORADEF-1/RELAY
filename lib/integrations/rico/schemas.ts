import { z } from "zod";

const numericValue = z.union([z.number(), z.string()]).transform((value, context) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    context.addIssue({ code: "custom", message: "Expected a numeric value." });
    return z.NEVER;
  }
  return parsed;
});

const optionalText = z.union([z.string(), z.number()]).nullish().transform((value) =>
  value === null || value === undefined ? null : String(value),
);

export const ricoFeatureSchema = z.object({
  name: z.string(),
  value: optionalText.transform((value) => value ?? ""),
});

export const ricoImageSchema = z.object({
  cover: z.union([z.boolean(), z.number(), z.string()]).transform((value) =>
    value === true || value === 1 || value === "1" || value === "true",
  ),
  url: z.string().url(),
});

export const ricoProductSchema = z.object({
  id: numericValue,
  reference: optionalText.transform((value) => value ?? ""),
  name: optionalText.transform((value) => value ?? ""),
  description_short: optionalText,
  price: numericValue,
  quantity: numericValue,
  id_manufacturer: numericValue.nullish().transform((value) => value ?? null),
  manufacturer_name: optionalText,
  id_category_default: numericValue.nullish().transform((value) => value ?? null),
  ean13: optionalText,
  active: z.union([z.boolean(), z.number(), z.string()]).transform((value) =>
    value === true || value === 1 || value === "1" || value === "true",
  ),
  date_add: optionalText,
  date_upd: optionalText,
  commodity_code: optionalText,
  country_of_origin: optionalText,
  features: z.array(ricoFeatureSchema).optional().default([]),
  images: z.array(ricoImageSchema).optional().default([]),
  matched_crossref: optionalText,
}).passthrough();

const successSchema = z.object({
  success: z.boolean(),
  msg: z.string().optional(),
}).passthrough();

export const ricoProductsResponseSchema = successSchema.extend({
  total_records: numericValue.optional().default(0),
  offset: numericValue.optional().default(0),
  count: numericValue.optional().default(0),
  products: z.array(ricoProductSchema).optional().default([]),
});

export const ricoProductResponseSchema = successSchema.extend({
  product: ricoProductSchema.optional(),
}).passthrough();

export const ricoManufacturersResponseSchema = successSchema.extend({
  manufacturers: z.array(z.string()).optional().default([]),
}).passthrough();

export const ricoMachineSchema = z.object({
  machine_id: numericValue,
  manufacturer: optionalText.transform((value) => value ?? ""),
  model: optionalText.transform((value) => value ?? ""),
  series: optionalText,
  engine: optionalText,
  kits: z.array(ricoProductSchema).optional().default([]),
}).passthrough();

export const ricoMachinesResponseSchema = successSchema.extend({
  total_records: numericValue.optional().default(0),
  machines: z.array(ricoMachineSchema).optional().default([]),
}).passthrough();

export const ricoCrossReferenceResponseSchema = successSchema.extend({
  query: optionalText.transform((value) => value ?? ""),
  total_records: numericValue.optional().default(0),
  products: z.array(ricoProductSchema).optional().default([]),
}).passthrough();
