"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { StatusBadge } from "@/components/status-badge";
import { buildTicketChatSubject } from "@/lib/ticket-chat";

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
  onSendMessage?: (payload: {
    messageText: string;
    files: File[];
  }) => Promise<boolean>;
  onAskAi?: (question: string) => Promise<void>;
  operatorChatHref?: string | null;
  operatorSmsHref?: string | null;
  operatorCallHrefs?: { label: string; href: string }[];
  unreadCount?: number;
  onOpen?: () => void;
  avoidRightDrawer?: boolean;
};

const senderTone: Record<ChatRole, string> = {
  requester: "border-[color:var(--border)] bg-white",
  operator:
    "border-[color:rgba(2,132,199,0.2)] bg-[color:rgba(2,132,199,0.08)]",
  admin: "border-[color:rgba(4,120,87,0.2)] bg-[color:rgba(4,120,87,0.09)]",
  ai: "border-[color:rgba(180,83,9,0.2)] bg-[color:rgba(180,83,9,0.08)]",
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
  avoidRightDrawer = false,
}: TicketChatPanelProps) {
  const [draftMessage, setDraftMessage] = useState("");
  const [queuedImages, setQueuedImages] = useState<File[]>([]);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [lastReadMessageCount, setLastReadMessageCount] = useState(
    messages.length,
  );
  const messageStreamRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const sortedMessages = useMemo(
    () =>
      [...messages].sort(
        (left, right) =>
          new Date(left.createdAt).getTime() -
          new Date(right.createdAt).getTime(),
      ),
    [messages],
  );

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

  async function handleSend() {
    if (!onSendMessage || isSending) {
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
      if (imageInputRef.current) {
        imageInputRef.current.value = "";
      }
    }
  }

  async function handleAskAi() {
    if (!onAskAi) {
      return;
    }

    const question =
      draftMessage.trim() || "Summarise the history of this request.";
    await onAskAi(question);
    setDraftMessage("");
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => {
          setLastReadMessageCount(messages.length);
          setIsOpen(true);
          onOpen?.();
        }}
        className={`fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-3 z-[80] flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-[#101827] text-white shadow-[0_14px_36px_rgba(15,23,42,0.3)] transition hover:-translate-y-0.5 hover:bg-[#172235] focus:outline-none focus:ring-4 focus:ring-emerald-500/25 sm:bottom-4 sm:right-4 sm:h-14 sm:w-14 ${
          avoidRightDrawer ? "ticket-chat-launcher--drawer-safe" : ""
        }`}
        aria-label={`Open ticket chat for job ${conversationLabel}`}
        title={`Open ${conversationSubject} chat`}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-sm font-black text-white sm:h-9 sm:w-9 sm:text-base">
          R
        </span>
        <span className="sr-only">{conversationSubject}</span>
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-rose-500 px-1 text-[10px] font-black text-white shadow-sm">
            1
          </span>
        ) : (
          <span className="absolute right-0 top-0 h-3 w-3 rounded-full border-2 border-[#101827] bg-emerald-400" />
        )}
      </button>
    );
  }

  return (
    <aside
      className={`fixed bottom-[max(0.5rem,env(safe-area-inset-bottom))] right-2 z-[90] flex h-[min(42rem,calc(100dvh-1rem))] w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-[1.25rem] border border-slate-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.3)] sm:bottom-4 sm:right-4 sm:h-[min(42rem,calc(100dvh-2rem))] sm:w-[min(27rem,calc(100vw-2rem))] sm:rounded-[1.5rem] ${
        avoidRightDrawer ? "ticket-chat-panel--drawer-safe" : ""
      }`}
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
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setLastReadMessageCount(messages.length);
              setIsOpen(false);
            }}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 text-lg text-slate-300 transition hover:bg-white/10 hover:text-white"
            aria-label="Minimise ticket chat"
          >
            −
          </button>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-3">
          <StatusBadge status={ticketStatus} />
          <p className="truncate text-xs text-slate-300" title={latestUpdate}>
            {latestUpdate}
          </p>
        </div>
      </header>

      <div
        ref={messageStreamRef}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-slate-50 px-4 py-4"
        aria-live="polite"
      >
        {sortedMessages.length === 0 ? (
          <div className="my-auto rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center">
            <p className="text-sm font-semibold text-slate-700">
              Start the conversation
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Messages and photos stay attached to Job {conversationLabel}.
            </p>
          </div>
        ) : (
          sortedMessages.map((message) => {
            const alignRight =
              mode === "operator"
                ? message.senderRole === "operator" ||
                  message.senderRole === "admin"
                : message.senderRole === "requester";

            return (
              <article
                key={message.id}
                className={`flex ${alignRight ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[86%] rounded-2xl border px-3.5 py-3 shadow-sm ${senderTone[message.senderRole]}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-slate-800">
                        {message.senderName}
                      </p>
                      <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400">
                        {message.isAiMessage
                          ? "Local Assistant"
                          : message.senderRole}
                      </p>
                    </div>
                    <time className="shrink-0 text-[10px] font-medium text-slate-400">
                      {formatDateTime(message.createdAt)}
                    </time>
                  </div>

                  {message.messageText ? (
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                      {message.messageText}
                    </p>
                  ) : null}

                  {message.attachmentUrl || message.attachmentName ? (
                    <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white">
                      {message.attachmentUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={message.attachmentUrl}
                          alt={message.attachmentName ?? "Chat attachment"}
                          className="h-36 w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-28 items-center justify-center px-4 text-center text-xs text-slate-500">
                          Preview unavailable
                        </div>
                      )}
                      <p className="truncate px-3 py-2 text-xs font-medium text-slate-600">
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

      <footer className="border-t border-slate-200 bg-white p-3">
        {notice ? (
          <div
            className={`mb-3 rounded-xl px-3 py-2 text-xs font-medium ${
              notice.type === "success"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-rose-50 text-rose-700"
            }`}
          >
            {notice.message}
          </div>
        ) : null}

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
          </div>
        ) : null}

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
            </div>
            <button
              type="button"
              onClick={handleSend}
              disabled={
                isSending || (!draftMessage.trim() && queuedImages.length === 0)
              }
              className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isSending ? "Sending…" : "Send"}
            </button>
          </div>
        </div>

        {showQuickActions ? (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setShowMoreActions((current) => !current)}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800"
              aria-expanded={showMoreActions}
            >
              {showMoreActions
                ? "Hide contact options"
                : "More contact options"}
            </button>
            {showMoreActions ? (
              <div className="mt-2 flex flex-wrap gap-2 rounded-xl bg-slate-50 p-2">
                {operatorChatHref ? (
                  <a
                    href={operatorChatHref}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm"
                  >
                    WhatsApp operator
                  </a>
                ) : null}
                {operatorCallHrefs.map((callOption) => (
                  <a
                    key={callOption.href}
                    href={callOption.href}
                    className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm"
                  >
                    {callOption.label}
                  </a>
                ))}
                {!operatorChatHref && operatorSmsHref ? (
                  <a
                    href={operatorSmsHref}
                    className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm"
                  >
                    SMS fallback
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </footer>
    </aside>
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
