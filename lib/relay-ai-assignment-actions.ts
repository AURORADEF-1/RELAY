import type { SupabaseClient } from "@supabase/supabase-js";
import { CORE_ADMIN_OPERATOR_OPTIONS } from "@/lib/admin-operators";
import { notifyAdminJobAssigned } from "@/lib/notifications";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import type { RelayAnalyticsTicket } from "@/lib/relay-console-ai";

type AdminProfile = {
  id: string;
  full_name: string | null;
};

export type RelayAiAssignmentCommand = {
  jobNumber: string;
  assigneeQuery: string;
};

export type RelayAiAssignmentDraft = {
  ticketId: string;
  ticketUpdatedAt: string | null;
  jobNumber: string;
  machineReference: string | null;
  requestSummary: string;
  currentAssignee: string | null;
  assigneeLabel: string;
  assigneeFullName: string;
  assigneeUserId: string;
};

function normalizeName(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ");
}

function cleanValue(value: string | undefined) {
  return (value ?? "").trim().replace(/[,.!?;:]+$/, "").trim();
}

export function parseRelayAiAssignmentCommand(question: string): RelayAiAssignmentCommand | null {
  const match = question.match(
    /\b(?:assign|assogn|allocate)\b.*?\bjob(?:\s*(?:number|no\.?|ref(?:erence)?))?\s*(?:is|:|#|-)?\s*([a-z0-9][a-z0-9/_-]*)\s+to\s+(.+?)(?:[.!?]|$)/i,
  );
  if (!match) return null;

  return {
    jobNumber: cleanValue(match[1]),
    assigneeQuery: cleanValue(match[2]),
  };
}

function ticketDescription(ticket: RelayAnalyticsTicket) {
  const summary = ticket.request_summary?.trim();
  const details = ticket.request_details?.trim();
  if (summary && details && normalizeName(summary) !== normalizeName(details)) {
    return `${summary}. ${details}`;
  }
  return summary || details || "Request details not recorded";
}

function findProfileMatches(query: string, profiles: AdminProfile[]) {
  const normalizedQuery = normalizeName(query);
  const exact = profiles.filter((profile) => normalizeName(profile.full_name) === normalizedQuery);
  if (exact.length > 0) return exact;

  return profiles.filter((profile) => {
    const normalizedName = normalizeName(profile.full_name);
    return normalizedName.startsWith(`${normalizedQuery} `)
      || normalizedName.replaceAll(" ", "").startsWith(normalizedQuery.replaceAll(" ", ""));
  });
}

function operatorLabel(query: string, fullName: string) {
  const coreMatch = CORE_ADMIN_OPERATOR_OPTIONS.find((name) => {
    const normalizedCore = normalizeName(name);
    return normalizeName(query) === normalizedCore || normalizeName(fullName).startsWith(normalizedCore);
  });
  return coreMatch ?? fullName;
}

export async function prepareRelayAiAssignment(
  supabase: SupabaseClient,
  command: RelayAiAssignmentCommand,
): Promise<RelayAiAssignmentDraft> {
  const { data: ticketData, error: ticketError } = await supabase
    .from("tickets")
    .select("id, job_number, machine_reference, request_summary, request_details, status, assigned_to, updated_at, created_at")
    .ilike("job_number", command.jobNumber)
    .order("updated_at", { ascending: false })
    .limit(10);
  if (ticketError) throw new Error(ticketError.message);

  const jobMatches = (ticketData ?? []) as RelayAnalyticsTicket[];
  if (jobMatches.length === 0) throw new Error(`I could not find job ${command.jobNumber}. No assignment was made.`);
  const activeMatches = jobMatches.filter((ticket) => ticket.status !== "COMPLETED");
  if (activeMatches.length === 0) {
    throw new Error(`All accessible tickets for job ${command.jobNumber} are completed. No assignment was made.`);
  }
  if (activeMatches.length > 1) {
    const choices = activeMatches
      .slice(0, 5)
      .map((ticket) =>
        `${ticket.machine_reference?.trim() || "no machine"} · ${ticket.status || "UNKNOWN"} · /tickets/${ticket.id}`,
      )
      .join("\n");
    throw new Error(`Job ${command.jobNumber} has more than one active ticket. Open the correct record before assigning:\n${choices}`);
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("role", "admin")
    .order("full_name", { ascending: true });
  if (error) throw new Error(error.message);

  const matches = findProfileMatches(command.assigneeQuery, (data ?? []) as AdminProfile[]);
  if (matches.length === 0) {
    throw new Error(`I could not find an admin user matching “${command.assigneeQuery}”. No assignment was made.`);
  }
  if (matches.length > 1) {
    const names = matches.map((profile) => profile.full_name || "Unnamed admin").join(", ");
    throw new Error(`“${command.assigneeQuery}” matches more than one admin: ${names}. Use the full name.`);
  }

  const ticket = activeMatches[0];
  const profile = matches[0];
  const fullName = profile.full_name?.trim();
  if (!fullName) throw new Error("That admin account has no display name and cannot be assigned by RELAY AI.");
  const assigneeLabel = operatorLabel(command.assigneeQuery, fullName);
  if (normalizeName(ticket.assigned_to) === normalizeName(assigneeLabel)) {
    throw new Error(`Job ${command.jobNumber} is already assigned to ${assigneeLabel}.`);
  }

  return {
    ticketId: ticket.id,
    ticketUpdatedAt: ticket.updated_at,
    jobNumber: ticket.job_number?.trim() || command.jobNumber,
    machineReference: ticket.machine_reference,
    requestSummary: ticketDescription(ticket),
    currentAssignee: ticket.assigned_to,
    assigneeLabel,
    assigneeFullName: fullName,
    assigneeUserId: profile.id,
  };
}

export async function executeRelayAiAssignment(
  supabase: SupabaseClient,
  draft: RelayAiAssignmentDraft,
) {
  const { user, profile, isAdmin } = await getCurrentUserWithRole(supabase, { forceFresh: true });
  if (!user || !isAdmin) throw new Error("Admin access is required to assign a job.");

  const { data: assignee, error: assigneeError } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", draft.assigneeUserId)
    .eq("role", "admin")
    .maybeSingle<{ id: string; full_name: string | null; role: string | null }>();
  if (assigneeError) throw new Error(assigneeError.message);
  if (!assignee) throw new Error("The selected assignee is no longer an active admin user.");

  const now = new Date().toISOString();
  let updateQuery = supabase
    .from("tickets")
    .update({ assigned_to: draft.assigneeLabel, updated_at: now })
    .eq("id", draft.ticketId);
  if (draft.ticketUpdatedAt) updateQuery = updateQuery.eq("updated_at", draft.ticketUpdatedAt);

  const { data: updatedTicket, error: updateError } = await updateQuery
    .select("id, job_number, assigned_to, updated_at")
    .maybeSingle();
  if (updateError) throw new Error(updateError.message);
  if (!updatedTicket) throw new Error("This ticket changed after the preview was prepared. Ask RELAY AI again to review the latest record.");

  const actorName = profile?.display_name?.trim() || user.email?.split("@")[0] || "Administrator";
  const warnings: string[] = [];
  const { error: historyError } = await supabase.from("ticket_updates").insert({
    ticket_id: draft.ticketId,
    comment: `Assigned to ${draft.assigneeLabel} by RELAY AI after confirmation by ${actorName}.`,
  });
  if (historyError) warnings.push(`Activity log failed: ${historyError.message}`);

  try {
    await notifyAdminJobAssigned(supabase, {
      userId: draft.assigneeUserId,
      ticketId: draft.ticketId,
      jobNumber: draft.jobNumber,
      requestSummary: draft.requestSummary,
      assignedBy: actorName,
    });
  } catch (error) {
    warnings.push(`Assignment notification failed: ${error instanceof Error ? error.message : "unknown error"}`);
  }

  return { actorName, warnings };
}
