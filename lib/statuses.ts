export const activeTicketStatuses = [
  "PENDING",
  "ESTIMATE",
  "QUOTE",
  "QUERY",
  "IN_PROGRESS",
  "ORDERED",
  "READY",
] as const;

export const completedTicketStatuses = ["COMPLETED"] as const;
export const ticketStatuses = [...activeTicketStatuses, ...completedTicketStatuses] as const;
export const activeTicketStatusOptions = ["ALL", ...activeTicketStatuses] as const;
export const ticketStatusOptions = ["ALL", ...ticketStatuses] as const;

export type TicketStatus = (typeof ticketStatuses)[number];
export type TicketStatusFilter = (typeof ticketStatusOptions)[number];
export type ActiveTicketStatus = (typeof activeTicketStatuses)[number];
export type ActiveTicketStatusFilter = (typeof activeTicketStatusOptions)[number];
