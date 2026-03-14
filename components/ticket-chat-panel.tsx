"use client";

import { useMemo, useState } from "react";
import { FileUploadPanel } from "@/components/file-upload-panel";
import { StatusBadge } from "@/components/status-badge";

export type ChatRole = "requester" | "parts" | "admin" | "ai";

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
};

const senderTone: Record<ChatRole, string> = {
  requester: "border-slate-200 bg-white",
  parts: "border-sky-200 bg-sky-50",
  admin: "border-emerald-200 bg-emerald-50",
  ai: "border-amber-200 bg-amber-50",
};

export function TicketChatPanel({
  ticketId,
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

  return (
    <section className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
            Ticket Chat
          </p>
          <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950">
            Request Conversation
          </h2>
          <p className="text-sm leading-6 text-slate-500">
            This conversation is linked to ticket{" "}
            <span className="font-semibold text-slate-700">{ticketId}</span>.
          </p>
        </div>

        <div className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Current Status
            </p>
            <div className="mt-2">
              <StatusBadge status={ticketStatus} />
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Latest Update
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-700">{latestUpdate}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Assigned To
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {assignedTo || "Stores queue"}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_0.36fr]">
        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-4">
            <div className="space-y-3">
              {sortedMessages.map((message) => (
                <article
                  key={message.id}
                  className={`rounded-2xl border p-4 ${senderTone[message.senderRole]}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {message.senderName}
                      </p>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        {message.isAiMessage ? "AI Assistant" : message.senderRole}
                      </p>
                    </div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      {formatDateTime(message.createdAt)}
                    </p>
                  </div>

                  {message.messageText ? (
                    <p className="mt-4 text-sm leading-7 text-slate-700">
                      {message.messageText}
                    </p>
                  ) : null}

                  {message.attachmentUrl || message.attachmentName ? (
                    <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
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
                        <div className="flex h-48 items-center justify-center bg-slate-100 px-6 text-center text-sm text-slate-500">
                          Preview unavailable for this attachment.
                        </div>
                      )}
                      <p className="px-4 py-3 text-sm font-medium text-slate-600">
                        {message.attachmentName ?? "Attachment"}
                      </p>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-900">
                {mode === "operator" ? "Reply as Stores / Operator" : "Message about this request"}
              </p>
              <p className="text-sm leading-6 text-slate-500">
                Messages, photos, and AI responses will stay linked to ticket{" "}
                <span className="font-semibold text-slate-700">{ticketId}</span>.
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
              className="mt-4 w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400"
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
                className={`mt-4 rounded-2xl px-4 py-3 text-sm ${
                  notice.type === "success"
                    ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border border-rose-200 bg-rose-50 text-rose-700"
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
                className="inline-flex h-11 items-center justify-center rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800"
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
                className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
              >
                {isAiLoading ? "Asking AI..." : "Ask AI About This Ticket"}
              </button>
              {queuedImages.length > 0 ? (
                <p className="self-center text-xs font-medium uppercase tracking-wide text-slate-500">
                  {queuedImages.length} image{queuedImages.length > 1 ? "s" : ""} queued
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
              AI Assistant
            </p>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              The RELAY assistant will answer questions using only this ticket’s
              request data, status history, messages, and attachments.
            </p>
            <div className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Example grounded prompts
              </p>
              <ul className="space-y-2 text-sm leading-6 text-slate-600">
                <li>&ldquo;What is the status of this order?&rdquo;</li>
                <li>&ldquo;Has this part been ordered?&rdquo;</li>
                <li>&ldquo;Summarise the history of this request.&rdquo;</li>
              </ul>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
              Escalation
            </p>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              Escalate this ticket directly from the support thread.
            </p>
            <div className="mt-4 grid gap-3">
              <button
                type="button"
                className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 bg-slate-50 px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-white"
              >
                Chat with Operator
              </button>
              <button
                type="button"
                className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 bg-slate-50 px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-white"
              >
                Call Operator
              </button>
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
