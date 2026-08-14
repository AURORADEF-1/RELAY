import { describe, expect, it } from "vitest";
import {
  buildTicketChatSubject,
  getTicketChatSenderRole,
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
});
