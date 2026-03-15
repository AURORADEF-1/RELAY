"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { NotificationBadge } from "@/components/notification-badge";
import { useNotifications } from "@/components/notification-provider";
import { TicketAttachmentGallery } from "@/components/ticket-attachment-gallery";
import {
  type ChatMessage,
  TicketChatPanel,
} from "@/components/ticket-chat-panel";
import { LogoutButton } from "@/components/logout-button";
import { RelayLogo } from "@/components/relay-logo";
import { StatusBadge } from "@/components/status-badge";
import { triggerActionFeedback } from "@/lib/action-feedback";
import {
  createTicketMessage,
  fetchTicketAttachments,
  fetchTicketMessages,
  type TicketAttachmentRecord,
  type TicketMessageRecord,
  uploadTicketAttachments,
} from "@/lib/relay-ticketing";
import type { RelayAiContext } from "@/lib/relay-ai";
import { getSupabaseClient } from "@/lib/supabase";

const OPERATOR_NUMBERS = [
  { label: "Call Operator 1", number: "07955273861" },
  { label: "Call Operator 2", number: "07425603839" },
] as const;

type TicketRecord = {
  id: string;
  user_id: string | null;
  requester_name: string | null;
  department: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  location_summary?: string | null;
  location_confirmed?: boolean | null;
  machine_reference: string | null;
  job_number: string | null;
  request_details: string | null;
  request_summary: string | null;
  status: string | null;
  assigned_to: string | null;
  notes: string | null;
  updated_at: string | null;
  created_at: string | null;
};

type TicketUpdate = {
  id?: string;
  status?: string | null;
  comment?: string | null;
  notes?: string | null;
  created_at?: string | null;
};

export default function TicketDetailPage() {
  const { requesterUnreadCount, adminBadgeCount, isAdmin } = useNotifications();
  const params = useParams<{ id: string }>();
  const ticketId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [ticket, setTicket] = useState<TicketRecord | null>(null);
  const [updates, setUpdates] = useState<TicketUpdate[]>([]);
  const [attachments, setAttachments] = useState<TicketAttachmentRecord[]>([]);
  const [messages, setMessages] = useState<TicketMessageRecord[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [chatNotice, setChatNotice] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadTicket() {
      const supabase = getSupabaseClient();

      if (!supabase) {
        setErrorMessage("Supabase environment variables are not configured.");
        setIsLoading(false);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!isMounted) {
        return;
      }

      setCurrentUserId(user?.id ?? null);

      const { data: ticketData, error: ticketError } = await supabase
        .from("tickets")
        .select("*")
        .eq("id", ticketId)
        .single();

      if (!isMounted) {
        return;
      }

      if (ticketError) {
        setErrorMessage(ticketError.message);
        setIsLoading(false);
        return;
      }

      const { data: updateData, error: updatesError } = await supabase
        .from("ticket_updates")
        .select("*")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: false });

      if (!isMounted) {
        return;
      }

      if (updatesError) {
        setErrorMessage(updatesError.message);
        setTicket(ticketData as TicketRecord);
        setUpdates([]);
      } else {
        setTicket(ticketData as TicketRecord);
        setUpdates((updateData ?? []) as TicketUpdate[]);
      }

      try {
        const [attachmentData, messageData] = await Promise.all([
          fetchTicketAttachments(supabase, ticketId),
          fetchTicketMessages(supabase, ticketId),
        ]);

        if (!isMounted) {
          return;
        }

        setAttachments(attachmentData);
        setMessages(messageData);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        setErrorMessage(
          loadError instanceof Error ? loadError.message : "Failed to load ticket chat.",
        );
      }

      setIsLoading(false);
    }

    loadTicket();

    return () => {
      isMounted = false;
    };
  }, [ticketId]);

  async function reloadTicketConversation(supabase: NonNullable<ReturnType<typeof getSupabaseClient>>, activeTicketId: string) {
    const [attachmentData, messageData] = await Promise.all([
      fetchTicketAttachments(supabase, activeTicketId),
      fetchTicketMessages(supabase, activeTicketId),
    ]);

    setAttachments(attachmentData);
    setMessages(messageData);
  }

  async function handleSendMessage(payload: { messageText: string; files: File[] }) {
    if (!ticket) {
      return false;
    }

    const supabase = getSupabaseClient();

    if (!supabase) {
      setErrorMessage("Supabase environment variables are not configured.");
      setChatNotice({
        type: "error",
        message: "Supabase environment variables are not configured.",
      });
      return false;
    }

    setIsSending(true);
    setErrorMessage("");
    setChatNotice(null);

    try {
      const uploadedAttachments =
        payload.files.length > 0
          ? await uploadTicketAttachments({
              supabase,
              ticketId: ticket.id,
              userId: currentUserId,
              files: payload.files,
              attachmentKind: "chat",
            })
          : [];

      const createdMessages = await createTicketMessage({
        supabase,
        ticketId: ticket.id,
        senderUserId: currentUserId,
        senderRole: "requester",
        messageText: payload.messageText,
        attachments: uploadedAttachments,
      });

      setMessages((current) => [...current, ...createdMessages]);
      setAttachments((current) => [...uploadedAttachments, ...current]);
      setChatNotice({
        type: "success",
        message: "Message sent successfully.",
      });
      triggerActionFeedback();
      await reloadTicketConversation(supabase, ticket.id);
      return true;
    } catch (sendError) {
      console.error("Ticket chat send failed", sendError);
      const message =
        sendError instanceof Error ? sendError.message : "Failed to send message.";
      setErrorMessage(
        message,
      );
      setChatNotice({
        type: "error",
        message,
      });
      return false;
    } finally {
      setIsSending(false);
    }
  }

  async function handleAskAi(question: string) {
    if (!ticket) {
      return;
    }

    setIsAiLoading(true);
    setErrorMessage("");

    try {
      const ticketContext: RelayAiContext = {
        ticketId: ticket.id,
        status: ticket.status ?? "PENDING",
        assignedTo: ticket.assigned_to,
        latestUpdate: updates[0]?.comment ?? updates[0]?.notes ?? ticket.notes,
        requesterName: ticket.requester_name,
        department: ticket.department,
        machineReference: ticket.machine_reference,
        jobNumber: ticket.job_number,
        requestSummary: ticket.request_summary,
        requestDetails: ticket.request_details,
        history: updates.map((update) => ({
          status: update.status,
          comment: update.comment ?? update.notes,
          createdAt: update.created_at,
        })),
        recentMessages: messages.slice(-6).map((message) => ({
          senderRole: message.sender_role,
          messageText: message.message_text,
          createdAt: message.created_at,
        })),
      };

      const response = await fetch(`/api/tickets/${ticket.id}/ai`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question,
          ticketContext,
        }),
      });

      const payload = (await response.json()) as { message?: string; error?: string };

      if (!response.ok || !payload.message) {
        throw new Error(payload.error || "AI request failed.");
      }

      setMessages((current) => [
        ...current,
        {
          id: `ai-${Date.now()}`,
          ticket_id: ticket.id,
          sender_user_id: null,
          sender_role: "ai",
          message_text: payload.message ?? null,
          attachment_url: null,
          attachment_type: null,
          is_ai_message: true,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (aiError) {
      setErrorMessage(
        aiError instanceof Error ? aiError.message : "Failed to get AI response.",
      );
    } finally {
      setIsAiLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#f8fafc_0%,#eef2f7_48%,#e2e8f0_100%)] px-6 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <nav className="flex flex-wrap items-center justify-between gap-4 rounded-[1.75rem] border border-white/70 bg-white/80 px-5 py-4 shadow-[0_18px_55px_-34px_rgba(15,23,42,0.35)] backdrop-blur">
          <RelayLogo />
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-600">
            <Link href="/" className="rounded-full px-4 py-2 hover:bg-white">
              Home
            </Link>
            <Link href="/legal" className="rounded-full px-4 py-2 hover:bg-white">
              Legal
            </Link>
            <Link
              href="/requests"
              className="rounded-full px-4 py-2 hover:bg-white"
            >
              My Requests
              <NotificationBadge count={requesterUnreadCount} />
            </Link>
            {isAdmin ? (
              <>
                <Link
                  href="/control"
                  className="rounded-full px-4 py-2 hover:bg-white"
                >
                  Workshop Control
                </Link>
                <Link href="/admin" className="rounded-full px-4 py-2 hover:bg-white">
                  Parts Control
                  <NotificationBadge count={adminBadgeCount} />
                </Link>
              </>
            ) : null}
            <LogoutButton />
          </div>
        </nav>

        <AuthGuard>
          <section className="rounded-[2rem] border border-white/80 bg-white/90 p-8 shadow-[0_28px_80px_-32px_rgba(15,23,42,0.35)] backdrop-blur sm:p-10">
            <div className="flex flex-col gap-8 lg:flex-row lg:justify-between">
              <div className="space-y-5">
                <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-600">
                  Request Record
                </div>
                <h1 className="text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">
                  Ticket Detail
                </h1>
                <p className="text-base leading-8 text-slate-600">
                  Review request information, workflow history, and ticket
                  commentary in one place.
                </p>
              </div>
              <div className="self-start">
                <Link
                  href="/requests"
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                >
                  Back to Requests
                </Link>
              </div>
            </div>

            {errorMessage ? (
              <div className="mt-8 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {errorMessage}
              </div>
            ) : null}

            {isLoading ? (
              <div className="mt-8 rounded-3xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                Loading ticket...
              </div>
            ) : ticket ? (
              <div className="mt-8 space-y-6">
                <div className="grid gap-6 lg:grid-cols-[1fr_0.95fr]">
                  <section className="rounded-3xl border border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Ticket ID
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-slate-950">
                          {ticket.id}
                        </p>
                      </div>
                      <StatusBadge status={ticket.status ?? "PENDING"} />
                    </div>

                    <dl className="mt-6 grid gap-5 sm:grid-cols-2">
                      <DetailItem label="Requester" value={ticket.requester_name} />
                      <DetailItem label="Department" value={ticket.department} />
                      <DetailItem label="Machine" value={ticket.machine_reference} />
                      <DetailItem label="Job Number" value={ticket.job_number} />
                      <DetailItem label="Assigned User" value={ticket.assigned_to} />
                      <DetailItem
                        label="Updated"
                        value={formatDate(ticket.updated_at)}
                      />
                    </dl>

                    {isOnsiteTicket(ticket) ? (
                      <div className="mt-6">
                        <OnsiteLocationCard ticket={ticket} />
                      </div>
                    ) : null}

                    <div className="mt-6 space-y-4">
                      <DetailBlock
                        label="Request Details"
                        value={ticket.request_details ?? ticket.request_summary}
                      />
                      <DetailBlock label="Admin Notes" value={ticket.notes} />
                    </div>
                  </section>

                  <section className="rounded-3xl border border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] p-6">
                    <div className="space-y-2">
                      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Status History & Comments
                      </p>
                      <p className="text-sm leading-6 text-slate-500">
                        Activity from status changes and comment updates.
                      </p>
                    </div>

                    <div className="mt-6 space-y-4">
                      {updates.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
                          No history entries found for this ticket yet.
                        </div>
                      ) : (
                        updates.map((update, index) => (
                          <article
                            key={update.id ?? `${update.created_at}-${index}`}
                            className="rounded-2xl border border-slate-200 bg-white p-5"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <StatusBadge
                                status={update.status ?? ticket.status ?? "PENDING"}
                              />
                              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                {formatDateTime(update.created_at)}
                              </p>
                            </div>
                            <p className="mt-4 text-sm leading-7 text-slate-600">
                              {update.comment ?? update.notes ?? "Status updated."}
                            </p>
                          </article>
                        ))
                      )}
                    </div>
                  </section>
                </div>

                <TicketAttachmentGallery
                  attachments={attachments.map((attachment) => ({
                    id: attachment.id,
                    name: attachment.file_name ?? "Attachment",
                    url: attachment.signed_url ?? null,
                    caption:
                      attachment.attachment_context === "chat"
                        ? "Image shared in the ticket conversation"
                        : "Image uploaded with the parts request",
                  }))}
                />

                <TicketChatPanel
                  ticketId={ticket.id}
                  ticketLabel={ticket.job_number}
                  ticketStatus={ticket.status ?? "PENDING"}
                  latestUpdate={
                    updates[0]?.comment ??
                    updates[0]?.notes ??
                    "No recent chat summary available."
                  }
                  assignedTo={ticket.assigned_to}
                  messages={mapMessagesToChat(messages, ticket, attachments)}
                  isSending={isSending}
                  isAiLoading={isAiLoading}
                  notice={chatNotice}
                  onSendMessage={handleSendMessage}
                  onAskAi={handleAskAi}
                  operatorChatHref={buildOperatorChatHref(ticket)}
                  operatorSmsHref={buildOperatorSmsHref(ticket)}
                  operatorCallHrefs={buildOperatorCallHrefs()}
                />
              </div>
            ) : (
              <div className="mt-8 rounded-3xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                Ticket not found.
              </div>
            )}
          </section>
        </AuthGuard>
      </div>
    </main>
  );
}

function mapMessagesToChat(
  messages: TicketMessageRecord[],
  ticket: TicketRecord,
  attachments: TicketAttachmentRecord[],
): ChatMessage[] {
  return messages.map((message) => {
    const attachment = attachments.find(
      (candidate) => candidate.message_id === message.id,
    );

    return {
      id: message.id,
      senderName: resolveSenderName(message, ticket),
      senderRole:
        message.sender_role === "parts" ? "operator" : message.sender_role,
      messageText: message.message_text ?? undefined,
      attachmentUrl: attachment?.signed_url ?? undefined,
      attachmentName: attachment?.file_name ?? undefined,
      createdAt: message.created_at ?? new Date().toISOString(),
      isAiMessage: message.is_ai_message ?? false,
    };
  });
}

function resolveSenderName(message: TicketMessageRecord, ticket: TicketRecord) {
  if (message.is_ai_message || message.sender_role === "ai") {
    return "RELAY Assistant";
  }

  if (message.sender_role === "requester") {
    return ticket.requester_name ?? "Requester";
  }

  if (message.sender_role === "admin") {
    return "Administrator";
  }

  if (message.sender_role === "operator") {
    return ticket.assigned_to || "Stores Operator";
  }

  return ticket.assigned_to || "Stores Operator";
}

function buildOperatorMessage(ticket: TicketRecord) {
  const partsRequested =
    ticket.request_summary?.trim() ||
    ticket.request_details?.trim() ||
    "No parts summary provided";
  const jobReference = ticket.job_number?.trim() || ticket.id;

  return [
    "Hello, I am following up on:",
    `Job Number: ${jobReference}`,
    `Requester: ${ticket.requester_name?.trim() || "Unknown requester"}`,
    `Parts Requested: ${partsRequested}`,
  ].join("\n");
}

function buildOperatorChatHref(ticket: TicketRecord) {
  const message = encodeURIComponent(buildOperatorMessage(ticket));
  return `https://wa.me/447955273861?text=${message}`;
}

function buildOperatorCallHrefs() {
  return OPERATOR_NUMBERS.map((option) => ({
    label: option.label,
    href: `tel:${option.number}`,
  }));
}

function buildOperatorSmsHref(ticket: TicketRecord) {
  return `sms:${OPERATOR_NUMBERS[0].number}?&body=${encodeURIComponent(buildOperatorMessage(ticket))}`;
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </dt>
      <dd className="mt-2 text-sm leading-7 text-slate-700">{value || "-"}</dd>
    </div>
  );
}

function DetailBlock({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-7 text-slate-600">
        {value || "-"}
      </p>
    </div>
  );
}

function OnsiteLocationCard({ ticket }: { ticket: TicketRecord }) {
  const mapUrl = buildMapUrl(ticket);
  const locationSummary = formatLocationSummary(ticket);

  if (!locationSummary && !mapUrl) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Onsite Location
          </p>
          <p className="text-sm leading-7 text-slate-700">
            {locationSummary || "Onsite request"}
          </p>
          {ticket.location_confirmed ? (
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
              Location confirmed
            </p>
          ) : null}
        </div>
        {mapUrl ? (
          <a
            href={mapUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-slate-50 px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-white"
          >
            {ticket.location_lat != null && ticket.location_lng != null
              ? "Open in Maps"
              : "View Onsite Location"}
          </a>
        ) : null}
      </div>
    </div>
  );
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function isOnsiteTicket(ticket: TicketRecord) {
  return ticket.department?.trim().toLowerCase() === "onsite";
}

function formatLocationSummary(ticket: TicketRecord) {
  if (ticket.location_summary?.trim()) {
    return ticket.location_summary.trim();
  }

  if (ticket.location_lat != null && ticket.location_lng != null) {
    return `Coordinates: ${ticket.location_lat.toFixed(5)}, ${ticket.location_lng.toFixed(5)}`;
  }

  return null;
}

function buildMapUrl(ticket: TicketRecord) {
  if (ticket.location_lat != null && ticket.location_lng != null) {
    return `https://www.google.com/maps?q=${ticket.location_lat},${ticket.location_lng}`;
  }

  if (ticket.location_summary?.trim()) {
    return `https://www.google.com/maps?q=${encodeURIComponent(ticket.location_summary.trim())}`;
  }

  return null;
}
