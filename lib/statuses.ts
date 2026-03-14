export const ticketStatuses = [
  "PENDING",
  "ESTIMATE",
  "QUOTE",
  "QUERY",
  "ORDERED",
  "READY",
  "COMPLETED",
] as const;

export const ticketStatusOptions = ["ALL", ...ticketStatuses] as const;

export type TicketStatus = (typeof ticketStatuses)[number];
export type TicketStatusFilter = (typeof ticketStatusOptions)[number];
