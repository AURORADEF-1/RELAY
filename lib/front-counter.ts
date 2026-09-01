import type { SupabaseClient } from "@supabase/supabase-js";

export const FRONT_COUNTER_LIVE_CHANNEL = "relay-front-counter-live";

export type FrontCounterCollectionRequest = {
  request_id: string;
  ticket_id: string;
  job_number: string;
  machine_reference: string | null;
  requester_name: string | null;
  request_summary: string | null;
  bin_location: string | null;
  requested_at: string;
  queue_position: number;
};

export type RequestedFrontCounterCollection = {
  request_id: string;
  ticket_id: string;
  job_number: string;
  request_summary: string | null;
  machine_reference: string | null;
  bin_location: string | null;
  requested_at: string;
  queue_position: number;
};

export type CompletedFrontCounterCollection = {
  ticket_id: string;
  job_number: string;
  completed_at: string;
  verified_label: boolean;
  issued_labels: number;
};

export function normalizeFrontCounterIdentifier(value: string) {
  const trimmed = value.trim().toUpperCase();
  return trimmed.match(/RLY-[A-Z0-9]{8,32}/)?.[0] ?? trimmed;
}

export async function requestFrontCounterCollection(
  supabase: SupabaseClient,
  identifier: string,
) {
  const { data, error } = await supabase.rpc("request_front_counter_collection", {
    p_identifier: normalizeFrontCounterIdentifier(identifier),
  });
  if (error) throw new Error(error.message);
  const result = Array.isArray(data) ? data[0] : null;
  if (!result) throw new Error("RELAY did not create a collection request.");
  return result as RequestedFrontCounterCollection;
}

export async function completeFrontCounterCollection(
  supabase: SupabaseClient,
  identifier: string,
) {
  const { data, error } = await supabase.rpc("complete_front_counter_collection", {
    p_identifier: normalizeFrontCounterIdentifier(identifier),
  });
  if (error) throw new Error(error.message);
  const result = Array.isArray(data) ? data[0] : null;
  if (!result) throw new Error("RELAY did not complete this collection.");
  return result as CompletedFrontCounterCollection;
}

export async function fetchFrontCounterCollectionQueue(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc("list_front_counter_collection_requests");
  if (error) throw new Error(error.message);
  return (data ?? []) as FrontCounterCollectionRequest[];
}
