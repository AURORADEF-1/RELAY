import { describe, expect, it, vi } from "vitest";
import {
  authorizeN8nOutlook,
  getN8nBearerToken,
} from "@/lib/integrations/n8n/outlook-auth";
import {
  outlookInboundMessageSchema,
  type OutlookTicketCandidate,
} from "@/lib/integrations/n8n/outlook-types";

vi.mock("server-only", () => ({}));

const ticket = (id: string): OutlookTicketCandidate => ({
  id,
  job_number: "51330",
  purchase_order_number: "PO-100",
  machine_reference: "24079",
  status: "ORDERED",
});

describe("n8n Outlook integration", () => {
  it("requires an exact bearer token without exposing it", () => {
    expect(getN8nBearerToken("Bearer live-secret")).toBe("live-secret");
    expect(authorizeN8nOutlook("Bearer live-secret", "live-secret")).toBe(true);
    expect(authorizeN8nOutlook("Bearer wrong", "live-secret")).toBe(false);
    expect(authorizeN8nOutlook(null, "live-secret")).toBe(false);
  });

  it("validates a bounded Outlook payload", () => {
    const parsed = outlookInboundMessageSchema.parse({
      internet_message_id: "<fictional-message@example.test>",
      sender_email: "supplier@example.test",
      subject: "PO PO-100 delivery update",
      body_text: "Expected delivery is 2026-08-03.",
      received_at: "2026-07-30T09:00:00+01:00",
      importance: "normal",
      has_attachments: false,
      attachments: [],
      po_number: "PO-100",
      classification: "EXACT_PO_MATCH_CANDIDATE",
    });
    expect(parsed.po_number).toBe("PO-100");
    expect(parsed.job_number).toBeNull();
  });

  it("rejects malformed senders and oversized attachment arrays", () => {
    const result = outlookInboundMessageSchema.safeParse({
      internet_message_id: "message-1",
      sender_email: "not-an-email",
      subject: "Test",
      body_text: "",
      received_at: "2026-07-30T09:00:00+01:00",
      attachments: Array.from({ length: 51 }, (_, index) => ({
        name: `file-${index}.pdf`,
        size: 10,
      })),
      classification: "MANUAL_REVIEW",
    });
    expect(result.success).toBe(false);
  });

  it("matches only one exact job and PO intersection", async () => {
    const { resolveOutlookTicketMatch } = await import(
      "@/lib/integrations/n8n/outlook-service"
    );
    const result = resolveOutlookTicketMatch({
      jobCandidates: [ticket("ticket-a")],
      poCandidates: [ticket("ticket-a")],
      hasJobReference: true,
      hasPoReference: true,
    });
    expect(result).toMatchObject({
      outcome: "SUCCESS",
      reason: "EXACT_JOB_AND_PO",
      ticket: { id: "ticket-a" },
    });
  });

  it("requires review when job and PO point to different tickets", async () => {
    const { resolveOutlookTicketMatch } = await import(
      "@/lib/integrations/n8n/outlook-service"
    );
    const result = resolveOutlookTicketMatch({
      jobCandidates: [ticket("ticket-a")],
      poCandidates: [ticket("ticket-b")],
      hasJobReference: true,
      hasPoReference: true,
    });
    expect(result).toMatchObject({
      outcome: "REVIEW_REQUIRED",
      reason: "CONFLICTING_REFERENCES",
      ticket: null,
    });
  });

  it("requires review for multiple exact matches", async () => {
    const { resolveOutlookTicketMatch } = await import(
      "@/lib/integrations/n8n/outlook-service"
    );
    const result = resolveOutlookTicketMatch({
      jobCandidates: [ticket("ticket-a"), ticket("ticket-b")],
      poCandidates: [],
      hasJobReference: true,
      hasPoReference: false,
    });
    expect(result).toMatchObject({
      outcome: "REVIEW_REQUIRED",
      reason: "MULTIPLE_MATCHES",
      candidateCount: 2,
    });
  });
});
