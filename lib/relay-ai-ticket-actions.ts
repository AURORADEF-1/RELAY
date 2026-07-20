import type { SupabaseClient } from "@supabase/supabase-js";
import { buildMachineSnapshot, lookupMachineRegistryRecord } from "@/lib/machine-registry";
import { notifyAdminsOfNewTicket } from "@/lib/notifications";
import { getCurrentUserWithRole } from "@/lib/profile-access";

export type RelayAiTicketDepartment = "Onsite" | "Yard";

export type RelayAiTicketDraft = {
  jobNumber: string;
  machineReference: string;
  requestDetails: string;
  department: RelayAiTicketDepartment | "";
};

export type RelayAiTicketDraftResult = {
  draft: RelayAiTicketDraft;
  missing: Array<"job number" | "machine reference" | "request details">;
};

function cleanCapturedValue(value: string | undefined) {
  return (value ?? "")
    .trim()
    .replace(/^(?:is|:|#|-)+\s*/i, "")
    .replace(/[,.!?;:]+$/, "")
    .trim();
}

export function parseRelayAiTicketDraft(question: string): RelayAiTicketDraftResult | null {
  const isCreateRequest = /\b(?:create|raise|open|submit|make)\b/i.test(question)
    && /\b(?:ticket|request)\b/i.test(question);
  if (!isCreateRequest) return null;

  const jobNumber = cleanCapturedValue(
    question.match(/\bjob(?:\s*(?:number|no\.?|ref(?:erence)?))?\s*(?:is|:|#|-)?\s*([a-z0-9][a-z0-9/_-]*)/i)?.[1],
  );
  const machineReference = cleanCapturedValue(
    question.match(
      /\bmachine(?:\s*(?:number|no\.?|ref(?:erence)?))?\s*(?:is|:|#|-)?\s*(.+?)(?=\s+(?:for|department|requesting|needing|with)\b|[,.;]|$)/i,
    )?.[1],
  );
  const requestDetails = cleanCapturedValue(
    question.match(/\b(?:for|requesting|needing)\s+(.+?)(?=\s+department\b|[.;]|$)/i)?.[1],
  );
  const departmentMatch = question.match(/\b(?:department\s*)?(Onsite|Yard)\b/i)?.[1];
  const department = departmentMatch
    ? departmentMatch.toLowerCase() === "onsite" ? "Onsite" : "Yard"
    : "";
  const missing: RelayAiTicketDraftResult["missing"] = [];
  if (!jobNumber) missing.push("job number");
  if (!machineReference) missing.push("machine reference");
  if (!requestDetails) missing.push("request details");

  return {
    draft: { jobNumber, machineReference, requestDetails, department },
    missing,
  };
}

export async function createRelayAiTicket(
  supabase: SupabaseClient,
  draft: RelayAiTicketDraft,
) {
  const { user, profile, isAdmin } = await getCurrentUserWithRole(supabase, { forceFresh: true });
  if (!user || !isAdmin) throw new Error("Admin access is required to create a ticket.");
  if (!draft.jobNumber.trim() || !draft.machineReference.trim() || !draft.requestDetails.trim()) {
    throw new Error("Job number, machine reference and request details are required.");
  }
  if (draft.department !== "Onsite" && draft.department !== "Yard") {
    throw new Error("Choose Yard or Onsite before submitting the ticket.");
  }

  const requesterName = profile?.display_name?.trim()
    || user.user_metadata?.full_name?.trim()
    || user.email?.split("@")[0]
    || "Administrator";
  const machineRecord = await lookupMachineRegistryRecord(supabase, draft.machineReference);
  const machineSnapshot = buildMachineSnapshot(machineRecord, user.id);
  const machineReference = draft.machineReference.trim();
  const requestDetails = draft.requestDetails.trim();
  const payload = {
    user_id: user.id,
    requester_name: requesterName,
    department: draft.department,
    machine_reference: machineReference,
    machine_number: machineSnapshot?.machine_number ?? machineReference,
    machine_number_normalized: machineSnapshot?.machine_number_normalized ?? null,
    machine_fleet_type: machineSnapshot?.machine_fleet_type ?? null,
    machine_item_description: machineSnapshot?.machine_item_description ?? null,
    machine_make: machineSnapshot?.machine_make ?? null,
    machine_model: machineSnapshot?.machine_model ?? null,
    machine_serial_number: machineSnapshot?.machine_serial_number ?? null,
    machine_status: machineSnapshot?.machine_status ?? null,
    machine_quantity: machineSnapshot?.machine_quantity ?? null,
    machine_buying_price: machineSnapshot?.machine_buying_price ?? null,
    machine_selling_price: machineSnapshot?.machine_selling_price ?? null,
    machine_source_sheet: machineSnapshot?.machine_source_sheet ?? null,
    machine_source_row: machineSnapshot?.machine_source_row ?? null,
    machine_verified: Boolean(machineSnapshot),
    machine_verified_at: machineSnapshot?.machine_verified_at ?? null,
    machine_verified_by: machineSnapshot?.machine_verified_by ?? null,
    job_number: draft.jobNumber.trim(),
    request_details: requestDetails,
    request_summary: requestDetails,
    status: "PENDING",
    is_retail_sale: false,
    location_lat: null,
    location_lng: null,
    location_summary: null,
    location_confirmed: false,
  };

  const { data: ticket, error: insertError } = await supabase
    .from("tickets")
    .insert(payload)
    .select("id")
    .single<{ id: string }>();
  if (insertError || !ticket) throw new Error(insertError?.message || "Failed to create ticket.");

  const warnings: string[] = [];
  const { error: updateError } = await supabase.from("ticket_updates").insert({
    ticket_id: ticket.id,
    status: "PENDING",
    comment: `Ticket created through RELAY AI after confirmation by ${requesterName}.`,
  });
  if (updateError) warnings.push(`Activity log failed: ${updateError.message}`);

  try {
    await notifyAdminsOfNewTicket(supabase, {
      ticketId: ticket.id,
      jobNumber: payload.job_number,
      requesterName: payload.requester_name,
      requestSummary: payload.request_summary,
    });
  } catch (error) {
    warnings.push(`Admin notification failed: ${error instanceof Error ? error.message : "unknown error"}`);
  }

  return {
    id: ticket.id,
    requesterName,
    machineVerified: Boolean(machineSnapshot),
    warnings,
  };
}
