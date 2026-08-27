import { describe, expect, it } from "vitest";
import {
  buildTicketChatSubject,
  compareTicketChatThreads,
  getTicketChatUnreadCount,
  getTicketChatSenderRole,
  isTicketChatRelevantToUser,
  shouldShowGlobalTicketChat,
} from "@/lib/ticket-chat";

const baseTicket = {
  id: "ticket-123",
  user_id: "requester-1",
  visible_to_user_id: null,
  assigned_to: "Tom",
  status: "IN_PROGRESS",
  updated_at: "2026-08-17T08:00:00.000Z",
};

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

  it("shows an operator only tickets assigned to that operator", () => {
    expect(
      isTicketChatRelevantToUser(baseTicket, {
        userId: "tom-user-id",
        operatorName: "Tom Shaw",
        isAdmin: true,
        canViewAll: false,
        scope: "mine",
      }),
    ).toBe(true);

    expect(
      isTicketChatRelevantToUser(
        { ...baseTicket, assigned_to: "Samantha" },
        {
          userId: "tom-user-id",
          operatorName: "Tom Shaw",
          isAdmin: true,
          canViewAll: false,
          scope: "mine",
        },
      ),
    ).toBe(false);
  });

  it("keeps the unassigned Stores queue separate from personal conversations", () => {
    expect(
      isTicketChatRelevantToUser(
        { ...baseTicket, assigned_to: null },
        {
          userId: "tom-user-id",
          operatorName: "Tom",
          isAdmin: true,
          canViewAll: false,
          scope: "queue",
        },
      ),
    ).toBe(true);
    expect(
      isTicketChatRelevantToUser(baseTicket, {
        userId: "tom-user-id",
        operatorName: "Tom",
        isAdmin: true,
        canViewAll: false,
        scope: "queue",
      }),
    ).toBe(false);
  });

  it("allows the all-conversations scope only for oversight managers", () => {
    expect(
      isTicketChatRelevantToUser(baseTicket, {
        userId: "manager-id",
        operatorName: "George",
        isAdmin: true,
        canViewAll: true,
        scope: "all",
      }),
    ).toBe(true);
    expect(
      isTicketChatRelevantToUser(baseTicket, {
        userId: "tom-user-id",
        operatorName: "Tom",
        isAdmin: true,
        canViewAll: false,
        scope: "all",
      }),
    ).toBe(false);
  });

  it("limits requester conversations to tickets they own or can view", () => {
    expect(
      isTicketChatRelevantToUser(baseTicket, {
        userId: "requester-1",
        operatorName: null,
        isAdmin: false,
        canViewAll: false,
        scope: "mine",
      }),
    ).toBe(true);
    expect(
      isTicketChatRelevantToUser(
        { ...baseTicket, user_id: "someone-else", visible_to_user_id: "requester-1" },
        {
          userId: "requester-1",
          operatorName: null,
          isAdmin: false,
          canViewAll: false,
          scope: "mine",
        },
      ),
    ).toBe(true);
    expect(
      isTicketChatRelevantToUser(
        { ...baseTicket, user_id: "someone-else" },
        {
          userId: "requester-1",
          operatorName: null,
          isAdmin: false,
          canViewAll: false,
          scope: "mine",
        },
      ),
    ).toBe(false);
  });

  it("counts only incoming messages created after the user read the thread", () => {
    expect(
      getTicketChatUnreadCount({
        currentUserId: "tom-user-id",
        lastReadAt: "2026-08-17T08:00:00.000Z",
        notificationCount: 9,
        messages: [
          { sender_user_id: "requester-1", created_at: "2026-08-17T07:59:00.000Z" },
          { sender_user_id: "tom-user-id", created_at: "2026-08-17T08:02:00.000Z" },
          { sender_user_id: "requester-1", created_at: "2026-08-17T08:03:00.000Z" },
        ],
      }),
    ).toBe(1);
  });

  it("uses notification counts until a thread has an explicit read marker", () => {
    expect(
      getTicketChatUnreadCount({
        currentUserId: "tom-user-id",
        lastReadAt: null,
        notificationCount: 2,
        messages: [],
      }),
    ).toBe(2);
  });

  it("sorts unread conversations first and then by latest activity", () => {
    const records = [
      {
        ticket: { updated_at: "2026-08-17T09:00:00.000Z" },
        unreadCount: 0,
        lastMessageAt: "2026-08-17T09:00:00.000Z",
      },
      {
        ticket: { updated_at: "2026-08-17T08:00:00.000Z" },
        unreadCount: 1,
        lastMessageAt: "2026-08-17T08:00:00.000Z",
      },
    ].sort(compareTicketChatThreads);

    expect(records[0].unreadCount).toBe(1);
  });
});
