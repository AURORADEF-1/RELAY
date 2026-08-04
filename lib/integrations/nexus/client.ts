import "server-only";

import type {
  NexusAllocationResponse,
  NexusCatalogueResponse,
} from "@/lib/integrations/nexus/types";

function nexusConfig() {
  const baseUrl = (
    process.env.NEXUS_API_URL ?? "https://mlp-parts.vercel.app"
  ).replace(/\/$/, "");
  const apiKey = process.env.NEXUS_RELAY_API_KEY;
  if (!apiKey) throw new Error("NEXUS RELAY API key is not configured.");
  return { baseUrl, apiKey };
}

async function nexusRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const { baseUrl, apiKey } = nexusConfig();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!response.ok || !payload)
    throw new Error(payload?.error || `NEXUS request failed (${response.status})`);
  return payload;
}

export function fetchNexusMachineCatalogue(
  manufacturer: string,
  model: string,
  serialNumber?: string | null,
) {
  const query = new URLSearchParams({ manufacturer, model });
  if (serialNumber?.trim()) query.set("serial", serialNumber.trim());
  return nexusRequest<NexusCatalogueResponse>(
    `/api/relay/catalogue?${query.toString()}`,
  );
}

export function allocateNexusTicketStock(input: {
  relayTicketId: string;
  relayTicketReference: string;
  fleetNumber: string;
  requestedBy: string;
  lines: Array<{ partId: string; quantity: number }>;
}) {
  return nexusRequest<NexusAllocationResponse>("/api/relay/allocations", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
