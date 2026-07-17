import type { SupabaseClient } from "@supabase/supabase-js";

const COLLECTION_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const COLLECTION_QR_PREFIX = "RELAY-COLLECTION";

export type CollectionConfirmation = {
  collected_at: string;
  requester_name: string | null;
  confirmed_by?: string | null;
  method: "qr" | "code" | "manual";
};

export function generateCollectionCode() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => COLLECTION_CODE_ALPHABET[byte % COLLECTION_CODE_ALPHABET.length]).join("");
}

export function buildCollectionQrPayload(ticketId: string, code: string) {
  return `${COLLECTION_QR_PREFIX}:${ticketId}:${code.toUpperCase()}`;
}

export function parseCollectionQrPayload(value: string) {
  const [prefix, ticketId, code, ...rest] = value.trim().split(":");
  if (prefix !== COLLECTION_QR_PREFIX || !ticketId || !/^[A-Z0-9]{6}$/.test(code ?? "") || rest.length > 0) {
    return null;
  }

  return { ticketId, code };
}

export async function issueTicketCollectionCode(
  supabase: SupabaseClient,
  ticketId: string,
  code: string,
) {
  const { data, error } = await supabase.rpc("issue_ticket_collection_code", {
    p_ticket_id: ticketId,
    p_collection_code: code,
  });

  if (error) {
    throw new Error(error.message);
  }

  return (data?.[0] ?? null) as { collection_code: string; expires_at: string } | null;
}

export async function confirmTicketCollection(
  supabase: SupabaseClient,
  ticketId: string,
  code: string,
  method: "qr" | "code",
) {
  const { data, error } = await supabase.rpc("confirm_ticket_collection", {
    p_ticket_id: ticketId,
    p_collection_code: code.trim().toUpperCase(),
    p_method: method,
  });

  if (error) {
    throw new Error(error.message);
  }

  return (data?.[0] ?? null) as CollectionConfirmation | null;
}

export async function confirmOwnTicketCollectionManually(
  supabase: SupabaseClient,
  ticketId: string,
) {
  const { data, error } = await supabase.rpc("confirm_own_ticket_collection_manually", {
    p_ticket_id: ticketId,
  });

  if (error) {
    throw new Error(error.message);
  }

  return (data?.[0] ?? null) as CollectionConfirmation | null;
}
