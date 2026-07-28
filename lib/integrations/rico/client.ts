import "server-only";

import type { z } from "zod";
import {
  RicoApiError,
  RicoConfigurationError,
} from "@/lib/integrations/rico/errors";
import {
  buildRicoMachineQueryCandidates,
  normalizeRicoMachine,
  normalizeRicoProduct,
} from "@/lib/integrations/rico/normalizers";
import {
  ricoCrossReferenceResponseSchema,
  ricoMachinesResponseSchema,
  ricoManufacturersResponseSchema,
  ricoProductSchema,
  ricoProductResponseSchema,
  ricoProductsResponseSchema,
} from "@/lib/integrations/rico/schemas";
import type {
  RicoCrossReferenceResult,
  RicoMachine,
  RicoProduct,
  RicoProductsPage,
} from "@/lib/integrations/rico/types";

const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_PAGE_SIZE = 1_000;
const inFlight = new Map<string, Promise<unknown>>();
const responseCache = new Map<string, { expiresAt: number; value: unknown }>();

type SearchParams = Record<string, string | number | boolean | null | undefined>;

function getConfig() {
  const apiKey = process.env.RICO_RELAY_API_KEY?.trim();
  const rawBaseUrl = process.env.RICO_API_BASE_URL?.trim();
  if (!apiKey || !rawBaseUrl) throw new RicoConfigurationError();

  const baseUrl = new URL(rawBaseUrl);
  if (baseUrl.protocol !== "https:") throw new RicoConfigurationError();
  return { apiKey, baseUrl };
}

function mapStatus(status: number) {
  if (status === 401) return new RicoApiError("RICO authentication failed.", status, "AUTHENTICATION");
  if (status === 403) return new RicoApiError("RICO access was denied.", status, "FORBIDDEN");
  if (status === 404) return new RicoApiError("RICO record was not found.", status, "NOT_FOUND");
  if (status === 429) return new RicoApiError("RICO rate limit reached.", status, "RATE_LIMITED");
  return new RicoApiError("RICO upstream request failed.", status, "UPSTREAM");
}

async function request<T>(
  operation: "products" | "product" | "catalog" | "manufacturers" | "machines" | "crossref",
  schema: z.ZodType<T>,
  params: SearchParams,
  options?: { signal?: AbortSignal; cacheMs?: number },
) {
  const { apiKey, baseUrl } = getConfig();
  const url = new URL(`${baseUrl.toString().replace(/\/$/, "")}/${operation}`);
  url.searchParams.set("apikey", apiKey);
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const safeKey = `${operation}:${JSON.stringify(params)}`;
  const cached = responseCache.get(safeKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value as T;
  const pending = inFlight.get(safeKey);
  if (pending) return pending as Promise<T>;

  const task = (async () => {
    const timeout = AbortSignal.timeout(DEFAULT_TIMEOUT_MS);
    const signal = options?.signal
      ? AbortSignal.any([options.signal, timeout])
      : timeout;
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal,
      });
      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      const server = response.headers.get("server")?.toLowerCase() ?? "";
      if (
        response.status === 403
        && contentType.includes("text/html")
        && server.includes("cloudflare")
      ) {
        throw new RicoApiError(
          "RICO's security gateway blocked the upstream request.",
          502,
          "UPSTREAM_BLOCKED",
        );
      }
      if (!response.ok) throw mapStatus(response.status);
      const parsed = schema.safeParse(await response.json());
      if (!parsed.success) {
        throw new RicoApiError("RICO returned malformed data.", 502, "INVALID_RESPONSE");
      }
      const payload = parsed.data as T & { success?: boolean };
      if (payload.success === false) throw new RicoApiError("RICO rejected the request.", 502, "UPSTREAM");
      if (options?.cacheMs) {
        responseCache.set(safeKey, { expiresAt: Date.now() + options.cacheMs, value: payload });
      }
      return payload;
    } catch (error) {
      if (error instanceof RicoApiError || error instanceof RicoConfigurationError) throw error;
      if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) {
        throw new RicoApiError("RICO request timed out.", 504, "TIMEOUT");
      }
      throw new RicoApiError("RICO upstream request failed.", 502, "UPSTREAM");
    } finally {
      inFlight.delete(safeKey);
    }
  })();

  inFlight.set(safeKey, task);
  return task;
}

export async function getRicoProducts(options: {
  offset?: number;
  count?: number;
  includeTax?: boolean;
  active?: boolean;
  updatedSince?: string;
  createdSince?: string;
  signal?: AbortSignal;
} = {}): Promise<RicoProductsPage> {
  const offset = Math.max(0, Math.trunc(options.offset ?? 0));
  const count = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(options.count ?? 100)));
  const payload = await request("products", ricoProductsResponseSchema, {
    limit: `${offset},${count}`,
    incl_tax: options.includeTax ? 1 : 0,
    active: options.active === false ? 0 : 1,
    updated_since: options.updatedSince,
    created_since: options.createdSince,
  }, { signal: options.signal });
  return {
    totalRecords: payload.total_records,
    offset: payload.offset,
    count: payload.count,
    products: payload.products.map(normalizeRicoProduct),
    checkedAt: new Date().toISOString(),
  };
}

export async function getRicoProduct(id: number, signal?: AbortSignal): Promise<RicoProduct> {
  const payload = await request("product", ricoProductResponseSchema, { id }, { signal, cacheMs: 5 * 60_000 });
  const directProduct = ricoProductSchema.safeParse(payload);
  const product = payload.product ?? (directProduct.success ? directProduct.data : undefined);
  if (!product) throw new RicoApiError("RICO product was not found.", 404, "NOT_FOUND");
  return normalizeRicoProduct(product);
}

export async function getRicoManufacturers(signal?: AbortSignal) {
  const payload = await request("manufacturers", ricoManufacturersResponseSchema, {}, {
    signal,
    cacheMs: 30 * 60_000,
  });
  return payload.manufacturers.map((value) => value.trim()).filter(Boolean);
}

export async function getRicoMachines(options: {
  manufacturer: string;
  model?: string;
  query?: string;
  series?: string;
  signal?: AbortSignal;
}): Promise<{ totalRecords: number; machines: RicoMachine[]; checkedAt: string }> {
  const searchValue = options.model ?? options.query;
  const candidates = searchValue
    ? buildRicoMachineQueryCandidates(searchValue)
    : [undefined];
  let payload: z.infer<typeof ricoMachinesResponseSchema> | undefined;

  for (const candidate of candidates) {
    payload = await request("machines", ricoMachinesResponseSchema, {
      manufacturer: options.manufacturer,
      model: options.model ? candidate : undefined,
      q: options.query ? candidate : undefined,
      series: options.series,
    }, { signal: options.signal });
    if (payload.machines.length > 0) break;
  }

  if (!payload) {
    throw new RicoApiError("RICO machine lookup failed.", 502, "UPSTREAM");
  }
  return {
    totalRecords: payload.total_records,
    machines: payload.machines.map(normalizeRicoMachine),
    checkedAt: new Date().toISOString(),
  };
}

export async function getRicoCrossReference(query: string, signal?: AbortSignal): Promise<RicoCrossReferenceResult> {
  const payload = await request("crossref", ricoCrossReferenceResponseSchema, { q: query }, { signal });
  return {
    query: payload.query || query,
    totalRecords: payload.total_records,
    products: payload.products.map(normalizeRicoProduct),
    checkedAt: new Date().toISOString(),
  };
}
