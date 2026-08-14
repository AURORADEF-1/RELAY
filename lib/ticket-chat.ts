export type TicketChatSenderRole = "admin" | "requester";

export function getTicketChatSenderRole(
  isAdmin: boolean,
): TicketChatSenderRole {
  return isAdmin ? "admin" : "requester";
}

export function buildTicketChatSubject(
  jobNumber: string | null | undefined,
  ticketId: string,
) {
  return `Job ${jobNumber?.trim() || ticketId}`;
}
