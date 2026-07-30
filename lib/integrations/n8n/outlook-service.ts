import "server-only";

import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type {
  OutlookInboundMessage,
  OutlookTicketCandidate,
  OutlookTicketMatch,
} from "@/lib/integrations/n8n/outlook-types";

const outlookProcessingResultSchema = z.object({
  duplicate: z.boolean(),
  outcome: z.enum(["PROCESSING", "SUCCESS", "REVIEW_REQUIRED", "FAILED"]),
  eventId: z.string().uuid(),
  ticketId: z.string().uuid().nullable(),
  reason: z.string().nullable(),
  candidateCount: z.number().int().min(0).optional(),
});

function getN8nSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("RELAY Outlook integration storage is not configured.");
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function hashOutlookMessageId(messageId: string) {
  return createHash("sha256").update(messageId.trim()).digest("hex");
}

function uniqueCandidates(candidates: OutlookTicketCandidate[]) {
  return Array.from(new Map(candidates.map((candidate) => [candidate.id, candidate])).values());
}

export function resolveOutlookTicketMatch(input: {
  jobCandidates: OutlookTicketCandidate[];
  poCandidates: OutlookTicketCandidate[];
  hasJobReference: boolean;
  hasPoReference: boolean;
}): OutlookTicketMatch {
  const jobs = uniqueCandidates(input.jobCandidates);
  const orders = uniqueCandidates(input.poCandidates);

  if (!input.hasJobReference && !input.hasPoReference) {
    return {
      ticket: null,
      outcome: "REVIEW_REQUIRED",
      reason: "NO_REFERENCE",
      candidateCount: 0,
    };
  }

  if (input.hasJobReference && input.hasPoReference) {
    const orderIds = new Set(orders.map((ticket) => ticket.id));
    const intersection = jobs.filter((ticket) => orderIds.has(ticket.id));
    if (intersection.length === 1) {
      return {
        ticket: intersection[0],
        outcome: "SUCCESS",
        reason: "EXACT_JOB_AND_PO",
        candidateCount: 1,
      };
    }
    const combined = uniqueCandidates([...jobs, ...orders]);
    return {
      ticket: null,
      outcome: "REVIEW_REQUIRED",
      reason: jobs.length === 1 && orders.length === 1
        ? "CONFLICTING_REFERENCES"
        : combined.length > 1
          ? "MULTIPLE_MATCHES"
          : "NO_MATCH",
      candidateCount: combined.length,
    };
  }

  const candidates = input.hasJobReference ? jobs : orders;
  if (candidates.length === 1) {
    return {
      ticket: candidates[0],
      outcome: "SUCCESS",
      reason: input.hasJobReference ? "EXACT_JOB" : "EXACT_PO",
      candidateCount: 1,
    };
  }
  return {
    ticket: null,
    outcome: "REVIEW_REQUIRED",
    reason: candidates.length > 1 ? "MULTIPLE_MATCHES" : "NO_MATCH",
    candidateCount: candidates.length,
  };
}

function safeEmailBody(value: string) {
  return value
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 2_500);
}

export function buildOutlookTicketComment(
  message: OutlookInboundMessage,
  messageHash: string,
) {
  const references = [
    message.job_number ? `Job: ${message.job_number}` : null,
    message.po_number ? `PO: ${message.po_number}` : null,
    message.machine_reference ? `Machine: ${message.machine_reference}` : null,
    message.delivery_eta ? `Stated ETA: ${message.delivery_eta}` : null,
    message.tracking_number ? `Tracking: ${message.tracking_number}` : null,
  ].filter(Boolean);
  const body = safeEmailBody(message.body_text);

  return [
    `Outlook email received from ${message.sender_name || message.sender_email} <${message.sender_email}>.`,
    `Subject: ${message.subject}`,
    references.length ? references.join(" · ") : null,
    body ? `Email content:\n${body}` : null,
    `[RELAY Outlook ${messageHash.slice(0, 16)}]`,
  ].filter(Boolean).join("\n\n");
}

export async function processOutlookInboundMessage(
  message: OutlookInboundMessage,
  integrationToken: string,
) {
  const messageHash = hashOutlookMessageId(message.internet_message_id);
  const supabase = getN8nSupabaseClient();
  const { data, error } = await supabase.rpc("process_n8n_outlook_message", {
    p_token: integrationToken,
    p_message: {
      ...message,
      ticket_comment: buildOutlookTicketComment(message, messageHash),
    },
  });
  if (error) throw new Error("RELAY could not write the Outlook processing event.");

  const parsed = outlookProcessingResultSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("RELAY received an invalid Outlook processing result.");
  }
  return parsed.data;
}
