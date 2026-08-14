"use client";

<<<<<<< HEAD
import { useMemo, useState } from "react";
import { FileUploadPanel } from "@/components/file-upload-panel";
=======
import { useEffect, useMemo, useRef, useState } from "react";
>>>>>>> 93624dc (Make ticket chat global and responsive)
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
  unreadCount?: number;
  onOpen?: () => void;
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
  unreadCount: unreadCountOverride,
  onOpen,
}: TicketChatPanelProps) {
  const [draftMessage, setDraftMessage] = useState("");
  const [queuedImages, setQueuedImages] = useState<File[]>([]);
<<<<<<< HEAD
  const [uploadResetKey, setUploadResetKey] = useState(0);
=======
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [lastReadMessageCount, setLastReadMessageCount] = useState(
    messages.length,
  );
  const messageStreamRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
>>>>>>> 93624dc (Make ticket chat global and responsive)

  const sortedMessages = useMemo(
    () =>
      [...messages].sort(
        (left, right) =>
          new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
      ),
    [messages],
  );

<<<<<<< HEAD
=======
  const conversationLabel = ticketLabel?.trim() || ticketId;
  const conversationSubject = buildTicketChatSubject(ticketLabel, ticketId);
  const queuedImagePreviews = useMemo(
    () => queuedImages.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [queuedImages],
  );
  const unreadCount = isOpen
    ? 0
    : unreadCountOverride ?? Math.max(0, messages.length - lastReadMessageCount);
  const showQuickActions =
    Boolean(operatorChatHref) ||
    Boolean(operatorSmsHref) ||
    operatorCallHrefs.length > 0;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const stream = messageStreamRef.current;
      if (stream) {
        stream.scrollTop = stream.scrollHeight;
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isOpen, sortedMessages.length]);

  useEffect(
    () => () => {
      queuedImagePreviews.forEach(({ url }) => URL.revokeObjectURL(url));
    },
    [queuedImagePreviews],
  );

>>>>>>> 93624dc (Make ticket chat global and responsive)
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
<<<<<<< HEAD
      setUploadResetKey((current) => current + 1);
=======
      if (imageInputRef.current) {
        imageInputRef.current.value = "";
      }
>>>>>>> 93624dc (Make ticket chat global and responsive)
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

<<<<<<< HEAD
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
=======
  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => {
          setLastReadMessageCount(messages.length);
          setIsOpen(true);
          onOpen?.();
        }}
        className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-3 z-[80] flex min-h-14 w-[min(22rem,calc(100vw-1.5rem))] items-center gap-3 rounded-2xl border border-white/10 bg-[#101827] px-4 py-3 text-left text-white shadow-[0_18px_50px_rgba(15,23,42,0.28)] transition hover:-translate-y-0.5 hover:bg-[#172235] focus:outline-none focus:ring-4 focus:ring-emerald-500/25 sm:bottom-5 sm:right-5"
        aria-label={`Open ticket chat for job ${conversationLabel}`}
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-lg font-black text-white">
          R
        </span>
        <span className="min-w-0">
          <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">
            Live ticket chat
          </span>
          <span className="block max-w-52 truncate text-sm font-semibold">
            {conversationSubject}
          </span>
        </span>
        {unreadCount > 0 ? (
          <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-rose-500 px-1.5 text-xs font-bold text-white">
            1
          </span>
        ) : (
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,0.15)]" />
        )}
      </button>
    );
  }

  return (
    <aside
      className="fixed bottom-[max(0.5rem,env(safe-area-inset-bottom))] right-2 z-[90] flex h-[min(42rem,calc(100dvh-1rem))] w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-[1.25rem] border border-slate-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.3)] sm:bottom-4 sm:right-4 sm:h-[min(42rem,calc(100dvh-2rem))] sm:w-[min(27rem,calc(100vw-2rem))] sm:rounded-[1.5rem]"
      aria-label={`Ticket live chat for job ${conversationLabel}`}
    >
      <header className="shrink-0 bg-[#101827] px-4 pb-3 pt-3 text-white sm:px-5 sm:pb-4 sm:pt-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-lg font-black">
              R
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                Live ticket chat
              </p>
              <h2 className="mt-1 truncate text-lg font-bold">
                {conversationSubject}
              </h2>
              <p className="mt-0.5 truncate text-xs text-slate-300">
                {assignedTo?.trim()
                  ? `With ${assignedTo.trim()}`
                  : "Connected to RELAY Stores"}
              </p>
>>>>>>> 93624dc (Make ticket chat global and responsive)
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

<<<<<<< HEAD
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
=======
        {queuedImagePreviews.length > 0 ? (
          <div className="mb-2 flex max-h-24 gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-2">
            {queuedImagePreviews.map(({ file, url }, index) => (
              <div key={`${file.name}-${file.lastModified}-${index}`} className="relative shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`Photo ready to send: ${file.name}`}
                  className="h-16 w-16 rounded-lg border border-slate-200 bg-white object-cover"
                />
                <button
                  type="button"
                  onClick={() =>
                    setQueuedImages((current) =>
                      current.filter((_, candidateIndex) => candidateIndex !== index),
                    )
                  }
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white shadow"
                  aria-label={`Remove ${file.name}`}
                >
                  ×
                </button>
              </div>
            ))}
>>>>>>> 93624dc (Make ticket chat global and responsive)
          </div>

<<<<<<< HEAD
          {notice ? (
            <div
              className={`mt-4 ${
                notice.type === "success"
                  ? "aurora-alert aurora-alert-success"
                  : "aurora-alert aurora-alert-error"
              }`}
            >
              {notice.message}
=======
        <input
          ref={imageInputRef}
          id={`chat-upload-${ticketId}-${mode}`}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          multiple
          className="sr-only"
          onChange={(event) => setQueuedImages(Array.from(event.target.files ?? []))}
        />

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2 focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-500/10">
          <textarea
            rows={2}
            value={draftMessage}
            onChange={(event) => setDraftMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void handleSend();
              }
            }}
            placeholder={
              mode === "operator"
                ? "Reply to the requester…"
                : "Message RELAY Stores…"
            }
            className="w-full resize-none bg-transparent px-2 py-1.5 text-sm text-slate-800 outline-none placeholder:text-slate-400"
            aria-label={`Message about job ${conversationLabel}`}
          />
          <div className="mt-1 flex items-center justify-between gap-2 border-t border-slate-200 px-1 pt-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white"
              >
                + Photo
                {queuedImages.length > 0 ? ` (${queuedImages.length})` : ""}
              </button>
              <button
                type="button"
                onClick={handleAskAi}
                disabled={isAiLoading}
                className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:bg-white disabled:opacity-50"
              >
                {isAiLoading ? "Thinking…" : "Assistant"}
              </button>
>>>>>>> 93624dc (Make ticket chat global and responsive)
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
