import "server-only";

import type { z } from "zod";
import {
  RicoApiError,
  RicoConfigurationError,
} from "@/lib/integrations/rico/errors";
import {
  ricoFleetListResponseSchema,
  ricoFleetMachineResponseSchema,
  ricoFleetPartsResponseSchema,
} from "@/lib/integrations/rico/fleet-schemas";
import type {
  RicoFleetMachineDetail,
  RicoFleetMachinePage,
  RicoFleetPartsPage,
} from "@/lib/integrations/rico/fleet-types";

const FLEET_TIMEOUT_MS = 12_000;
const MAX_FLEET_PAGE_SIZE = 500;
const inFlight = new Map<string, Promise<unknown>>();
const responseCache = new Map<string, { expiresAt: number; value: unknown }>();

type FleetSearchParams = Record<string, string | number | null | undefined>;

function getFleetConfig() {
  const apiKey = process.env.RICO_FLEET_API_KEY?.trim();
  const rawBaseUrl = process.env.RICO_FLEET_API_BASE_URL?.trim();
  if (!apiKey || !rawBaseUrl) throw new RicoConfigurationError();
  const baseUrl = new URL(rawBaseUrl);
  if (baseUrl.protocol !== "https:") throw new RicoConfigurationError();
  return { apiKey, baseUrl };
}

function fleetStatusError(status: number) {
  if (status === 401) return new RicoApiError("RICO Fleet authentication failed.", status, "AUTHENTICATION");
  if (status === 403) return new RicoApiError("RICO Fleet access was denied.", status, "FORBIDDEN");
  if (status === 404) return new RicoApiError("RICO Fleet machine was not found.", status, "NOT_FOUND");
  if (status === 429) return new RicoApiError("RICO Fleet rate limit reached.", status, "RATE_LIMITED");
  return new RicoApiError("RICO Fleet request failed.", status, "UPSTREAM");
}

async function fleetRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  params: FleetSearchParams,
  options?: { signal?: AbortSignal; cacheMs?: number },
) {
  const { apiKey, baseUrl } = getFleetConfig();
  const url = new URL(`${baseUrl.toString().replace(/\/$/, "")}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const safeKey = `${path}:${JSON.stringify(params)}`;
  const cached = responseCache.get(safeKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value as T;
  const pending = inFlight.get(safeKey);
  if (pending) return pending as Promise<T>;

  const task = (async () => {
    const timeout = AbortSignal.timeout(FLEET_TIMEOUT_MS);
    const signal = options?.signal
      ? AbortSignal.any([options.signal, timeout])
      : timeout;
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        cache: "no-store",
        signal,
      });
      if (!response.ok) throw fleetStatusError(response.status);
      const parsed = schema.safeParse(await response.json());
      if (!parsed.success) {
        throw new RicoApiError("RICO Fleet returned malformed data.", 502, "INVALID_RESPONSE");
      }
      const payload = parsed.data as T & { ok?: boolean };
      if (payload.ok === false) throw new RicoApiError("RICO Fleet rejected the request.", 502, "UPSTREAM");
      if (options?.cacheMs) {
        responseCache.set(safeKey, {
          expiresAt: Date.now() + options.cacheMs,
          value: payload,
        });
      }
      return payload;
    } catch (error) {
      if (error instanceof RicoApiError || error instanceof RicoConfigurationError) throw error;
      if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) {
        throw new RicoApiError("RICO Fleet request timed out.", 504, "TIMEOUT");
      }
      throw new RicoApiError("RICO Fleet request failed.", 502, "UPSTREAM");
    } finally {
      inFlight.delete(safeKey);
    }
  })();

  inFlight.set(safeKey, task);
  return task;
}

export async function getRicoFleetMachines(options: {
  query?: string;
  serial?: string;
  fleetNumber?: string;
  manufacturer?: string;
  updatedSince?: string;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
} = {}): Promise<RicoFleetMachinePage> {
  const limit = Math.min(MAX_FLEET_PAGE_SIZE, Math.max(1, Math.trunc(options.limit ?? 50)));
  const offset = Math.max(0, Math.trunc(options.offset ?? 0));
  const payload = await fleetRequest("fleet", ricoFleetListResponseSchema, {
    q: options.query,
    serial: options.serial,
    fleet_number: options.fleetNumber,
    manufacturer: options.manufacturer,
    updated_since: options.updatedSince,
    limit,
    offset,
  }, { signal: options.signal, cacheMs: 2 * 60_000 });
  return { ...payload, checkedAt: new Date().toISOString() };
}

export async function getRicoFleetMachine(
  reference: string,
  signal?: AbortSignal,
): Promise<RicoFleetMachineDetail> {
  const payload = await fleetRequest(
    `fleet/${encodeURIComponent(reference)}`,
    ricoFleetMachineResponseSchema,
    {},
    { signal, cacheMs: 60_000 },
  );
  return { ...payload, checkedAt: new Date().toISOString() };
}

export async function getRicoFleetParts(
  includeOils = false,
  signal?: AbortSignal,
): Promise<RicoFleetPartsPage> {
  const payload = await fleetRequest(
    "parts",
    ricoFleetPartsResponseSchema,
    { include_oils: includeOils ? 1 : 0 },
    { signal, cacheMs: 60_000 },
  );
  return { ...payload, checkedAt: new Date().toISOString() };
}
