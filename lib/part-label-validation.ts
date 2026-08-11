import type { SupabaseClient } from "@supabase/supabase-js";

export type PartLabelValidationRecord = {
  id: string;
  ticket_id: string;
  label_batch_id: string;
  label_token: string;
  ticket_part_id: string | null;
  job_number: string;
  bin_location: string;
  part_number: string | null;
  part_description: string | null;
  unit_index: number;
  unit_total: number;
  status: string;
  printed_at: string | null;
  verified_at: string | null;
  issued_at: string | null;
  created_at: string;
};

export type VerifiedPartLabel = {
  label_job_id: string;
  ticket_id: string;
  job_number: string;
  part_number: string | null;
  part_description: string | null;
  unit_index: number;
  unit_total: number;
  bin_location: string;
  print_status: string;
  verified_at: string;
  already_verified: boolean;
  is_latest_batch: boolean;
};

const LABEL_FIELDS = [
  "id",
  "ticket_id",
  "label_batch_id",
  "label_token",
  "ticket_part_id",
  "job_number",
  "bin_location",
  "part_number",
  "part_description",
  "unit_index",
  "unit_total",
  "status",
  "printed_at",
  "verified_at",
  "issued_at",
  "created_at",
].join(",");

export function normalizePartLabelToken(value: string) {
  const trimmed = value.trim().toUpperCase();
  const embeddedToken = trimmed.match(/RLY-[A-Z0-9]{8,32}/)?.[0];
  return embeddedToken ?? trimmed;
}

export async function fetchLatestTicketLabelBatch(
  supabase: SupabaseClient,
  ticketId: string,
) {
  const { data, error } = await supabase
    .from("label_print_jobs")
    .select(LABEL_FIELDS)
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (error) throw new Error(error.message);

  const records = (data ?? []) as unknown as PartLabelValidationRecord[];
  const latestBatchId = records[0]?.label_batch_id;
  return latestBatchId
    ? records.filter((record) => record.label_batch_id === latestBatchId)
    : [];
}

export async function verifyPartLabel(
  supabase: SupabaseClient,
  rawToken: string,
) {
  const token = normalizePartLabelToken(rawToken);
  if (!/^RLY-[A-Z0-9]{8,32}$/.test(token)) {
    throw new Error("Scan a RELAY part label beginning RLY-.");
  }

  const { data, error } = await supabase.rpc("verify_part_label", {
    p_label_token: token,
  });
  if (error) throw new Error(error.message);

  const result = Array.isArray(data) ? data[0] : null;
  if (!result) throw new Error("This RELAY part label was not found.");
  return result as VerifiedPartLabel;
}

export async function markTicketLabelsIssued(
  supabase: SupabaseClient,
  ticketId: string,
) {
  const { data, error } = await supabase.rpc("mark_ticket_labels_issued", {
    p_ticket_id: ticketId,
  });
  if (error) throw new Error(error.message);
  return typeof data === "number" ? data : 0;
}
