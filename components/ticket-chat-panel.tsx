"use client";

import { useMemo, useState } from "react";
import { FileUploadPanel } from "@/components/file-upload-panel";
import { StatusBadge } from "@/components/status-badge";

export type ChatRole = "requester" | "operator" | "admin" | "ai";

export type ChatMessage = {
  id: string;
  senderName: string;
  senderRole: ChatRole;
  messageText?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  createdAt: string;
  isAiMessage?: boolean;
};

type TicketChatPanelProps = {
  ticketId: string;
  ticketLabel?: string | null;
  ticketStatus: string;
  latestUpdate: string;
  assignedTo?: string | null;
  messages: ChatMessage[];
  mode?: "requester" | "operator";
  isSending?: boolean;
  isAiLoading?: boolean;
  notice?: { type: "success" | "error"; message: string } | null;
  onSendMessage?: (
    payload: { messageText: string; files: File[] },
  ) => Promise<boolean>;
  onAskAi?: (question: string) => Promise<void>;
  operatorChatHref?: string | null;
  operatorSmsHref?: string | null;
  operatorCallHrefs?: { label: string; href: string }[];
};

const senderTone: Record<ChatRole, string> = {
  requester: "border-[color:var(--border)] bg-[color:var(--background-panel-strong)]",
  operator: "border-[color:rgba(2,132,199,0.24)] bg-[color:rgba(2,132,199,0.08)]",
  admin: "border-[color:rgba(4,120,87,0.24)] bg-[color:rgba(4,120,87,0.08)]",
  ai: "border-[color:rgba(180,83,9,0.24)] bg-[color:rgba(180,83,9,0.08)]",
};

export function TicketChatPanel({
  ticketId,
  ticketLabel,
  ticketStatus,
  latestUpdate,
  assignedTo,
  messages,
  mode = "requester",
  isSending = false,
  isAiLoading = false,
  notice = null,
  onSendMessage,
  onAskAi,
  operatorChatHref = null,
  operatorSmsHref = null,
  operatorCallHrefs = [],
}: TicketChatPanelProps) {
  const [draftMessage, setDraftMessage] = useState("");
  const [queuedImages, setQueuedImages] = useState<File[]>([]);
  const [uploadResetKey, setUploadResetKey] = useState(0);

  const sortedMessages = useMemo(
    () =>
      [...messages].sort(
        (left, right) =>
          new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
      ),
    [messages],
  );

  async function handleSend() {
    if (!onSendMessage) {
      return;
    }

    if (!draftMessage.trim() && queuedImages.length === 0) {
      return;
    }

    const wasSuccessful = await onSendMessage({
      messageText: draftMessage,
      files: queuedImages,
    });

    if (wasSuccessful) {
      setDraftMessage("");
      setQueuedImages([]);
      setUploadResetKey((current) => current + 1);
    }
  }

  async function handleAskAi() {
    if (!onAskAi) {
      return;
    }

    const question = draftMessage.trim() || "Summarise the history of this request.";
    await onAskAi(question);
    setDraftMessage("");
  }

  const conversationLabel = ticketLabel?.trim() || "this request";

  return (
    <section className="aurora-section">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <p className="aurora-kicker">
            Ticket Chat
          </p>
          <h2 className="aurora-heading">
            Request Conversation
          </h2>
          <p className="aurora-copy text-sm">
            This conversation is linked to job number{" "}
            <span className="font-semibold text-[color:var(--foreground-strong)]">{conversationLabel}</span>.
          </p>
        </div>

        <div className="grid gap-3 rounded-[1.5rem] border border-[color:var(--border)] bg-[color:var(--background-panel-strong)] p-4 sm:grid-cols-3">
          <div>
            <p className="aurora-stat-label">
              Current Status
            </p>
            <div className="mt-2">
              <StatusBadge status={ticketStatus} />
            </div>
          </div>
          <div>
            <p className="aurora-stat-label">
              Latest Update
            </p>
            <p className="mt-2 text-sm leading-6 text-[color:var(--foreground-muted)]">{latestUpdate}</p>
          </div>
          <div>
            <p className="aurora-stat-label">
              Assigned User
            </p>
            <p className="mt-2 text-sm leading-6 text-[color:var(--foreground-muted)]">
              {assignedTo || "Stores queue"}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_0.36fr]">
        <div className="space-y-4">
          <div className="rounded-[1.5rem] border border-[color:var(--border)] bg-[color:var(--background-panel-strong)] p-4 shadow-[var(--shadow-soft)]">
            <div className="space-y-3">
              {sortedMessages.map((message) => (
                <article
                  key={message.id}
                  className={`rounded-[1.25rem] border p-4 ${senderTone[message.senderRole]}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[color:var(--foreground-strong)]">
                        {message.senderName}
                      </p>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--foreground-subtle)]">
                        {message.isAiMessage ? "AI Assistant" : message.senderRole}
                      </p>
                    </div>
                    <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--foreground-subtle)]">
                      {formatDateTime(message.createdAt)}
                    </p>
                  </div>

                  {message.messageText ? (
                    <p className="mt-4 text-sm leading-7 text-[color:var(--foreground-muted)]">
                      {message.messageText}
                    </p>
                  ) : null}

                  {message.attachmentUrl || message.attachmentName ? (
                    <div className="mt-4 overflow-hidden rounded-[1.125rem] border border-[color:var(--border)] bg-[color:var(--background-panel-strong)]">
                      {message.attachmentUrl ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={message.attachmentUrl}
                            alt={message.attachmentName ?? "Chat attachment"}
                            className="h-48 w-full object-cover"
                          />
                        </>
                      ) : (
                        <div className="flex h-48 items-center justify-center bg-[color:var(--background-muted)] px-6 text-center text-sm text-[color:var(--foreground-subtle)]">
                          Preview unavailable for this attachment.
                        </div>
                      )}
                      <p className="px-4 py-3 text-sm font-medium text-[color:var(--foreground-muted)]">
                        {message.attachmentName ?? "Attachment"}
                      </p>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-[color:var(--border)] bg-[color:var(--background-panel-strong)] p-5 shadow-[var(--shadow-soft)]">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-[color:var(--foreground-strong)]">
                {mode === "operator" ? "Reply as Stores / Operator" : "Message about this request"}
              </p>
              <p className="text-sm leading-6 text-[color:var(--foreground-muted)]">
                Messages, photos, and AI responses will stay linked to job number{" "}
                <span className="font-semibold text-[color:var(--foreground-strong)]">{conversationLabel}</span>.
              </p>
            </div>

            <textarea
              rows={5}
              value={draftMessage}
              onChange={(event) => setDraftMessage(event.target.value)}
              placeholder={
                mode === "operator"
                  ? "Reply to the requester or add a Stores update..."
                  : "Ask Stores about this ticket or request an update..."
              }
              className="aurora-textarea mt-4"
            />

            <div className="mt-4">
              <FileUploadPanel
                key={uploadResetKey}
                label="Attach image to message"
                helperText="Upload photos of the issue, reference images, or diagrams for this ticket chat."
                inputId={`chat-upload-${ticketId}-${mode}`}
                buttonLabel={mode === "operator" ? "Upload diagram or photo" : "Upload image"}
                emptyText="No chat images queued yet."
                onFilesChange={setQueuedImages}
              />
            </div>

            {notice ? (
              <div
                className={`mt-4 ${
                  notice.type === "success"
                    ? "aurora-alert aurora-alert-success"
                    : "aurora-alert aurora-alert-error"
                }`}
              >
                {notice.message}
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleSend}
                disabled={isSending}
                className="aurora-button px-5"
              >
                {isSending
                  ? "Sending..."
                  : mode === "operator"
                    ? "Send Reply"
                    : "Send Message"}
              </button>
              <button
                type="button"
                onClick={handleAskAi}
                disabled={isAiLoading}
                className="aurora-button-secondary px-5"
              >
                {isAiLoading ? "Asking AI..." : "Ask AI About This Ticket"}
              </button>
              {queuedImages.length > 0 ? (
                <p className="self-center text-xs font-medium uppercase tracking-wide text-[color:var(--foreground-subtle)]">
                  {queuedImages.length} image{queuedImages.length > 1 ? "s" : ""} queued
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="aurora-panel p-5">
            <p className="aurora-stat-label text-sm">
              AI Assistant
            </p>
            <p className="mt-3 text-sm leading-7 text-[color:var(--foreground-muted)]">
              The RELAY assistant will answer questions using only this ticket’s
              request data, status history, messages, and attachments.
            </p>
            <div className="mt-4 space-y-3 rounded-[1.125rem] border border-[color:var(--border)] bg-[color:var(--background-muted)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--foreground-subtle)]">
                Example grounded prompts
              </p>
              <ul className="space-y-2 text-sm leading-6 text-[color:var(--foreground-muted)]">
                <li>&ldquo;What is the status of this order?&rdquo;</li>
                <li>&ldquo;Has this part been ordered?&rdquo;</li>
                <li>&ldquo;Summarise the history of this request.&rdquo;</li>
              </ul>
            </div>
          </div>

          <div className="aurora-panel p-5">
            <p className="aurora-stat-label text-sm">
              Escalation
            </p>
            <p className="mt-3 text-sm leading-7 text-[color:var(--foreground-muted)]">
              Escalate this ticket directly from the support thread.
            </p>
            <div className="mt-4 grid gap-3">
              <a
                href={operatorChatHref ?? undefined}
                target="_blank"
                rel="noreferrer"
                aria-disabled={!operatorChatHref}
                className="aurora-button-secondary"
              >
                Chat with Operator
              </a>
              <div className="grid gap-2 sm:grid-cols-2">
                {operatorCallHrefs.map((callOption) => (
                  <a
                    key={callOption.href}
                    href={callOption.href}
                    className="aurora-button-secondary"
                  >
                    {callOption.label}
                  </a>
                ))}
              </div>
              {!operatorChatHref ? (
                <p className="text-xs leading-6 text-[color:var(--foreground-subtle)]">
                  Operator contact options will appear when request details are
                  available on this ticket.
                </p>
              ) : operatorSmsHref ? (
                <a
                  href={operatorSmsHref}
                  className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--foreground-subtle)] transition hover:text-[color:var(--foreground-strong)]"
                >
                  SMS fallback
                </a>
              ) : null}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
