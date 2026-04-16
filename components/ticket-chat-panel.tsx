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
  const showQuickActions =
    Boolean(operatorChatHref) || Boolean(operatorSmsHref) || operatorCallHrefs.length > 0;

  return (
    <section className="aurora-section">
      <div className="rounded-[1.75rem] border border-[color:var(--border)] bg-[color:var(--background-panel-strong)] p-5 shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="aurora-kicker">Ticket Chat</p>
            <h2 className="aurora-heading">Request Conversation</h2>
            <p className="text-sm leading-6 text-[color:var(--foreground-muted)]">
              Job{" "}
              <span className="font-semibold text-[color:var(--foreground-strong)]">
                {conversationLabel}
              </span>
              {assignedTo?.trim() ? (
                <>
                  {" "}with{" "}
                  <span className="font-semibold text-[color:var(--foreground-strong)]">
                    {assignedTo.trim()}
                  </span>
                </>
              ) : null}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={ticketStatus} />
            <div className="rounded-full border border-[color:var(--border)] bg-[color:var(--background-muted)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--foreground-subtle)]">
              Live thread
            </div>
          </div>
        </div>

        <p className="mt-4 text-sm leading-6 text-[color:var(--foreground-muted)]">
          {latestUpdate}
        </p>

        <div className="mt-5 rounded-[1.5rem] border border-[color:var(--border)] bg-[color:var(--background-muted)] p-3">
          <div className="flex max-h-[32rem] flex-col gap-3 overflow-y-auto pr-1">
            {sortedMessages.length === 0 ? (
              <div className="flex min-h-40 items-center justify-center rounded-[1.25rem] border border-dashed border-[color:var(--border)] bg-[color:var(--background-panel-strong)] px-6 text-center text-sm text-[color:var(--foreground-subtle)]">
                No chat messages yet. Start with a short update or add a photo.
              </div>
            ) : (
              sortedMessages.map((message) => {
                const alignRight =
                  mode === "operator"
                    ? message.senderRole === "operator" || message.senderRole === "admin"
                    : message.senderRole === "requester";

                return (
                  <article
                    key={message.id}
                    className={`flex ${alignRight ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`w-full max-w-2xl rounded-[1.25rem] border px-4 py-3 ${senderTone[message.senderRole]}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[color:var(--foreground-strong)]">
                            {message.senderName}
                          </p>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--foreground-subtle)]">
                            {message.isAiMessage ? "AI Assistant" : message.senderRole}
                          </p>
                        </div>
                        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[color:var(--foreground-subtle)]">
                          {formatDateTime(message.createdAt)}
                        </p>
                      </div>

                      {message.messageText ? (
                        <p className="mt-3 text-sm leading-7 text-[color:var(--foreground-muted)]">
                          {message.messageText}
                        </p>
                      ) : null}

                      {message.attachmentUrl || message.attachmentName ? (
                        <div className="mt-3 overflow-hidden rounded-[1rem] border border-[color:var(--border)] bg-[color:var(--background-panel-strong)]">
                          {message.attachmentUrl ? (
                            <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={message.attachmentUrl}
                                alt={message.attachmentName ?? "Chat attachment"}
                                className="h-44 w-full object-cover"
                              />
                            </>
                          ) : (
                            <div className="flex h-40 items-center justify-center bg-[color:var(--background-muted)] px-6 text-center text-sm text-[color:var(--foreground-subtle)]">
                              Preview unavailable for this attachment.
                            </div>
                          )}
                          <p className="px-4 py-3 text-sm font-medium text-[color:var(--foreground-muted)]">
                            {message.attachmentName ?? "Attachment"}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </div>

        <div className="mt-5 rounded-[1.5rem] border border-[color:var(--border)] bg-[color:var(--background-panel-strong)] p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-[color:var(--foreground-strong)]">
                {mode === "operator" ? "Reply as Stores / Operator" : "Message about this request"}
              </p>
              <p className="mt-1 text-sm leading-6 text-[color:var(--foreground-muted)]">
                Keep replies short and specific. Images stay attached to this ticket.
              </p>
            </div>
            {queuedImages.length > 0 ? (
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--foreground-subtle)]">
                {queuedImages.length} image{queuedImages.length > 1 ? "s" : ""} queued
              </p>
            ) : null}
          </div>

          <textarea
            rows={4}
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
              label="Attach image"
              helperText="Optional: add a photo, diagram, or reference image."
              inputId={`chat-upload-${ticketId}-${mode}`}
              buttonLabel={mode === "operator" ? "Upload image" : "Add image"}
              emptyText="No images queued."
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
              {isAiLoading ? "Asking AI..." : "Ask AI"}
            </button>
          </div>

          {showQuickActions ? (
            <div className="mt-5 rounded-[1.125rem] border border-[color:var(--border)] bg-[color:var(--background-muted)] p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--foreground-subtle)]">
                    Quick Actions
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[color:var(--foreground-muted)]">
                    Use direct contact only if chat is not enough to move the request forward.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {operatorChatHref ? (
                    <a
                      href={operatorChatHref}
                      target="_blank"
                      rel="noreferrer"
                      className="aurora-button-secondary"
                    >
                      Chat with Operator
                    </a>
                  ) : null}
                  {operatorCallHrefs.map((callOption) => (
                    <a
                      key={callOption.href}
                      href={callOption.href}
                      className="aurora-button-secondary"
                    >
                      {callOption.label}
                    </a>
                  ))}
                  {!operatorChatHref && operatorSmsHref ? (
                    <a href={operatorSmsHref} className="aurora-button-secondary">
                      SMS Fallback
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>
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
