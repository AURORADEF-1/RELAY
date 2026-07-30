import { z } from "zod";

const nullableReference = z.string()
  .trim()
  .max(160)
  .regex(/^[a-z0-9][a-z0-9/_. -]*$/i, "Invalid operational reference.")
  .nullable()
  .optional()
  .transform((value) => value || null);

const originalMatchSchema = z.object({
  value: z.string().trim().max(160),
  matchedText: z.string().trim().max(300),
}).nullable().optional();

export const outlookInboundMessageSchema = z.object({
  internet_message_id: z.string().trim().min(3).max(1_000),
  conversation_id: z.string().trim().max(1_000).nullable().optional(),
  sender_email: z.string().trim().email().max(320),
  sender_name: z.string().trim().max(300).nullable().optional(),
  subject: z.string().trim().min(1).max(1_000),
  body_text: z.string().max(20_000).default(""),
  received_at: z.string().datetime({ offset: true }),
  importance: z.enum(["low", "normal", "high"]).default("normal"),
  has_attachments: z.boolean().default(false),
  attachments: z.array(z.object({
    name: z.string().trim().min(1).max(500),
    content_type: z.string().trim().max(200).nullable().optional(),
    size: z.number().int().min(0).max(100_000_000),
  })).max(50).default([]),
  job_number: nullableReference,
  po_number: nullableReference,
  machine_reference: nullableReference,
  delivery_eta: z.string().datetime({ offset: true }).nullable().optional(),
  tracking_number: nullableReference,
  supplier_name: z.string().trim().max(300).nullable().optional(),
  classification: z.enum([
    "EXACT_JOB_MATCH_CANDIDATE",
    "EXACT_PO_MATCH_CANDIDATE",
    "MACHINE_MATCH_CANDIDATE",
    "MANUAL_REVIEW",
  ]),
  original_matches: z.object({
    job_number: originalMatchSchema,
    po_number: originalMatchSchema,
    machine_reference: originalMatchSchema,
    delivery_eta: originalMatchSchema,
    tracking_number: originalMatchSchema,
  }).partial().default({}),
});

export type OutlookInboundMessage = z.infer<typeof outlookInboundMessageSchema>;

export type OutlookTicketCandidate = {
  id: string;
  job_number: string | null;
  purchase_order_number: string | null;
  machine_reference: string | null;
  status: string;
};

export type OutlookTicketMatch = {
  ticket: OutlookTicketCandidate | null;
  outcome: "SUCCESS" | "REVIEW_REQUIRED";
  reason:
    | "EXACT_JOB"
    | "EXACT_PO"
    | "EXACT_JOB_AND_PO"
    | "NO_REFERENCE"
    | "NO_MATCH"
    | "MULTIPLE_MATCHES"
    | "CONFLICTING_REFERENCES";
  candidateCount: number;
};
