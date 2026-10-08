export type SupportTicketStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED";

export type SupportTicket = {
  id: string;
  reference: string;
  subject: string;
  description: string;
  requester_name: string;
  requester_email: string | null;
  requester_user_id: string | null;
  status: SupportTicketStatus;
  created_at: string;
  updated_at: string;
};

export type SupportTicketAttachment = {
  id: string;
  support_ticket_id: string;
  uploaded_by: string;
  file_name: string;
  file_path: string;
  mime_type: string;
  file_size: number;
  created_at: string;
  signed_url?: string | null;
};

export function normalizeSupportTicketDraft(value: unknown) {
  const draft = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const subject = typeof draft.subject === "string" ? draft.subject.trim().slice(0, 120) : "";
  const description = typeof draft.description === "string" ? draft.description.trim().slice(0, 4000) : "";
  const requesterName = typeof draft.requesterName === "string" ? draft.requesterName.trim().slice(0, 120) : "";
  const requesterEmail = typeof draft.requesterEmail === "string" ? draft.requesterEmail.trim().toLowerCase().slice(0, 254) : "";

  if (subject.length < 3) throw new Error("Enter a subject of at least 3 characters.");
  if (description.length < 10) throw new Error("Describe the issue in at least 10 characters.");
  if (requesterName.length < 2) throw new Error("Enter your name.");
  if (requesterEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requesterEmail)) {
    throw new Error("Enter a valid email address or leave it blank.");
  }

  return { subject, description, requesterName, requesterEmail: requesterEmail || null };
}

export function supportTicketNotification(ticket: Pick<SupportTicket, "reference" | "subject" | "requester_name">) {
  return {
    title: `Support ticket ${ticket.reference}`,
    body: `${ticket.requester_name}: ${ticket.subject}`,
  };
}
