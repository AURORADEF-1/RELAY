"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileUploadPanel } from "@/components/file-upload-panel";
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
}: TicketChatPanelProps) {
  const [draftMessage, setDraftMessage] = useState("");
  const [queuedImages, setQueuedImages] = useState<File[]>([]);
  const [uploadResetKey, setUploadResetKey] = useState(0);
  const [showAttachmentPanel, setShowAttachmentPanel] = useState(false);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [isOpen, setIsOpen] = useState(true);
  const [lastReadMessageCount, setLastReadMessageCount] = useState(
    messages.length,
  );
  const messageStreamRef = useRef<HTMLDivElement | null>(null);

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
  const unreadCount = isOpen
    ? 0
    : Math.max(0, messages.length - lastReadMessageCount);
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
      setShowAttachmentPanel(false);
      setUploadResetKey((current) => current + 1);
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
        }}
        className="fixed bottom-5 left-5 z-[80] flex min-h-14 items-center gap-3 rounded-full border border-white/10 bg-[#101827] px-4 py-3 text-left text-white shadow-[0_18px_50px_rgba(15,23,42,0.28)] transition hover:-translate-y-0.5 hover:bg-[#172235] focus:outline-none focus:ring-4 focus:ring-emerald-500/25"
        aria-label={`Open ticket chat for job ${conversationLabel}`}
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-lg font-black text-white">
          R
        </span>
        <span className="min-w-0">
          <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">
            Live ticket chat
          </span>
          <span className="block max-w-48 truncate text-sm font-semibold">
            {conversationSubject}
          </span>
        </span>
        {unreadCount > 0 ? (
          <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-rose-500 px-1.5 text-xs font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : (
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,0.15)]" />
        )}
      </button>
    );
  }

  return (
    <aside
      className="fixed bottom-4 left-4 z-[90] flex h-[min(42rem,calc(100vh-2rem))] w-[min(27rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.3)]"
      aria-label={`Ticket live chat for job ${conversationLabel}`}
    >
      <header className="bg-[#101827] px-5 pb-4 pt-4 text-white">
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

        {showAttachmentPanel ? (
          <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <FileUploadPanel
              key={uploadResetKey}
              label="Attach image"
              helperText="Optional photo or reference image for this job."
              inputId={`chat-upload-${ticketId}-${mode}`}
              buttonLabel="Choose image"
              emptyText="No image selected."
              onFilesChange={setQueuedImages}
            />
          </div>
        ) : null}

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
                onClick={() => setShowAttachmentPanel((current) => !current)}
                className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white"
                aria-expanded={showAttachmentPanel}
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
