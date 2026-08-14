import { describe, expect, it } from "vitest";
import {
  buildTicketChatSubject,
  getTicketChatSenderRole,
  shouldShowGlobalTicketChat,
} from "@/lib/ticket-chat";

describe("ticket live chat", () => {
  it("records administrator replies as administrator messages", () => {
    expect(getTicketChatSenderRole(true)).toBe("admin");
  });

  it("records requester replies as requester messages", () => {
    expect(getTicketChatSenderRole(false)).toBe("requester");
  });

  it("uses the job number as the ticket-specific subject", () => {
    expect(buildTicketChatSubject(" 53066 ", "ticket-123")).toBe("Job 53066");
    expect(buildTicketChatSubject(null, "ticket-123")).toBe("Job ticket-123");
  });

  it("keeps global chat available throughout authenticated workflow views", () => {
    expect(shouldShowGlobalTicketChat("/console")).toBe(true);
    expect(shouldShowGlobalTicketChat("/my-jobs")).toBe(true);
    expect(shouldShowGlobalTicketChat("/oversight")).toBe(true);
    expect(shouldShowGlobalTicketChat("/reports")).toBe(true);
  });

  it("avoids duplicate chat panels on ticket and non-interactive routes", () => {
    expect(shouldShowGlobalTicketChat("/tickets/ticket-123")).toBe(false);
    expect(shouldShowGlobalTicketChat("/login")).toBe(false);
    expect(shouldShowGlobalTicketChat("/legal")).toBe(false);
    expect(shouldShowGlobalTicketChat("/wallboard")).toBe(false);
  });
});
