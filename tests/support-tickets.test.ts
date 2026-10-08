import { describe, expect, it } from "vitest";
import { normalizeSupportTicketDraft, supportTicketNotification } from "@/lib/support-tickets";

describe("support tickets", () => {
  it("normalizes a valid public submission", () => {
    expect(normalizeSupportTicketDraft({
      subject: "  Login problem  ",
      description: "  I cannot open the fleet page.  ",
      requesterName: "  Jamie  ",
      requesterEmail: " JAMIE@EXAMPLE.COM ",
    })).toEqual({
      subject: "Login problem",
      description: "I cannot open the fleet page.",
      requesterName: "Jamie",
      requesterEmail: "jamie@example.com",
    });
  });

  it("rejects incomplete submissions", () => {
    expect(() => normalizeSupportTicketDraft({ subject: "Hi", description: "short", requesterName: "J" })).toThrow();
  });

  it("builds an admin notification", () => {
    expect(supportTicketNotification({ reference: "SUP-1234", subject: "Printer offline", requester_name: "Alex" })).toEqual({
      title: "Support ticket SUP-1234",
      body: "Alex: Printer offline",
    });
  });
});
