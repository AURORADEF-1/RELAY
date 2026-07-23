"use client";

import { useEffect, useRef, useState } from "react";
import { ConsoleIcon } from "@/components/console/console-icon";
import { lookupMachineRegistryRecord } from "@/lib/machine-registry";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import {
  answerRelayConsoleExactLookup,
  answerRelayConsoleQuestion,
  loadRelayAnalyticsSnapshot,
  RELAY_AI_GUARDRAILS,
  type RelayAnalyticsSnapshot,
} from "@/lib/relay-console-ai";
import {
  executeRelayAiAssignment,
  parseRelayAiAssignmentCommand,
  prepareRelayAiAssignment,
  type RelayAiAssignmentDraft,
} from "@/lib/relay-ai-assignment-actions";
import {
  answerMachineRegistryLookup,
  parseRelayAiMachineReference,
} from "@/lib/relay-ai-machine-lookup";
import {
  answerRelayAiTakeuchiPartQuestion,
  buildRelayAiTicketPartsGuidance,
  parseRelayAiMachinePartQuestion,
  parseRelayAiTakeuchiPartQuestion,
} from "@/lib/relay-ai-parts-guidance";
import {
  applyRelayAiTicketSequenceAnswer,
  createRelayAiTicket,
  missingRelayAiTicketFields,
  parseRelayAiTicketDraft,
  relayAiTicketFieldPrompt,
  type RelayAiTicketDraft,
} from "@/lib/relay-ai-ticket-actions";
import { getSupabaseClient } from "@/lib/supabase";

type RelayAiMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
  facts?: string[];
  sourceNote?: string;
  download?: {
    filename: string;
    label?: string;
    content?: string;
    mimeType?: string;
    workbook?: {
      sheetName: string;
      rows: Array<Array<string | number>>;
    };
  };
  copyText?: string;
  ticketAction?: {
    draft: RelayAiTicketDraft;
    status: "pending" | "submitting" | "cancelled" | "submitted";
  };
  assignmentAction?: {
    draft: RelayAiAssignmentDraft;
    status: "pending" | "submitting" | "cancelled" | "submitted";
  };
};

const STARTER_MESSAGE: RelayAiMessage = {
  id: "welcome",
  role: "assistant",
  text: "Ask me about jobs, PO numbers, delivery ETAs, suppliers, demand, spend, queues or admin performance. I can prepare tickets and job assignments, but I always show a confirmation review before changing RELAY data.",
};

const SUGGESTED_QUESTIONS = [
  "Show machine reference 19592 make, model and serial",
  "List Shred Station's fleet and request counts",
  "How many jobs has Tom completed this month?",
  "Who is our main supplier?",
];

export function RelayAiPanel({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<RelayAiMessage[]>([STARTER_MESSAGE]);
  const [draft, setDraft] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [syncedAt, setSyncedAt] = useState<Date | null>(null);
  const [ticketSequence, setTicketSequence] = useState<RelayAiTicketDraft | null>(null);
  const snapshotRef = useRef<RelayAnalyticsSnapshot | null>(null);
  const snapshotPromiseRef = useRef<Promise<RelayAnalyticsSnapshot> | null>(null);
  const questionTimesRef = useRef<number[]>([]);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const timeoutId = window.setTimeout(() => inputRef.current?.focus(), 180);
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [isOpen, isThinking, messages]);

  async function getSnapshot() {
    const cached = snapshotRef.current;
    if (
      cached
      && Date.now() - cached.loadedAt.getTime() < RELAY_AI_GUARDRAILS.cacheWindowMs
    ) {
      return cached;
    }
    if (snapshotPromiseRef.current) return snapshotPromiseRef.current;

    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured.");
    snapshotPromiseRef.current = (async () => {
      const { user, isAdmin } = await getCurrentUserWithRole(supabase, { forceFresh: true });
      if (!user || !isAdmin) throw new Error("Admin access is required for RELAY AI.");

      const snapshot = await loadRelayAnalyticsSnapshot(supabase);
      snapshotRef.current = snapshot;
      setSyncedAt(snapshot.loadedAt);
      return snapshot;
    })();

    try {
      return await snapshotPromiseRef.current;
    } finally {
      snapshotPromiseRef.current = null;
    }
  }

  async function getTicketPartsGuidance(
    ticketDraft: RelayAiTicketDraft,
    includeDescription: boolean,
  ) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured.");

    try {
      return await buildRelayAiTicketPartsGuidance(supabase, {
        machineReference: ticketDraft.machineReference,
        requestDetails: includeDescription ? ticketDraft.requestDetails : "",
      });
    } catch (error) {
      return {
        text: `Machine and catalogue checks are temporarily unavailable. RELAY will retain the entered machine reference and best part description for the parts team. (${error instanceof Error ? error.message : "unknown lookup error"})`,
        facts: ["Catalogue check unavailable"],
        sourceNote: "The read-only catalogue check failed. Ticket confirmation remains available and no fitment was inferred.",
      };
    }
  }

  async function showTicketConfirmation(ticketDraft: RelayAiTicketDraft, completePrompt: boolean) {
    const guidance = await getTicketPartsGuidance(ticketDraft, true);
    setTicketSequence(null);
    setMessages((current) => [
      ...current,
      {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        text: `${guidance.text}\n\n${completePrompt ? "I found all four required ticket fields in your request." : "I have all four required ticket fields."} Review the ticket below and explicitly confirm before I submit it.`,
        facts: guidance.facts,
        ticketAction: { draft: ticketDraft, status: "pending" },
        sourceNote: `${guidance.sourceNote} Draft only; no ticket has been submitted.`,
      },
    ]);
  }

  async function submitQuestion(value = draft) {
    const question = value.trim();
    if (!question || isThinking) return;
    if (question.length > RELAY_AI_GUARDRAILS.maxQuestionLength) {
      setMessages((current) => [
        ...current,
        {
          id: `assistant-limit-${Date.now()}`,
          role: "assistant",
          text: `Please shorten the question to ${RELAY_AI_GUARDRAILS.maxQuestionLength} characters or fewer. This protects RELAY from accidental broad or repeated requests.`,
          sourceNote: "No database query was run.",
        },
      ]);
      return;
    }

    const now = Date.now();
    questionTimesRef.current = questionTimesRef.current.filter(
      (time) => now - time < RELAY_AI_GUARDRAILS.questionWindowMs,
    );
    if (questionTimesRef.current.length >= RELAY_AI_GUARDRAILS.maxQuestionsPerWindow) {
      setMessages((current) => [
        ...current,
        {
          id: `assistant-rate-limit-${Date.now()}`,
          role: "assistant",
          text: "RELAY AI has paused new questions briefly because this session reached its query guardrail. Existing answers and downloads remain available; try again in a few minutes.",
          sourceNote: "No database query was run. This session allows 20 questions per five minutes.",
        },
      ]);
      return;
    }
    questionTimesRef.current.push(now);

    setDraft("");
    setMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, role: "user", text: question },
    ]);
    setIsThinking(true);

    try {
      if (ticketSequence) {
        if (/^(?:(?:cancel|stop)(?:\s+(?:the\s+)?ticket)?|never mind|nevermind)$/i.test(question)) {
          setTicketSequence(null);
          setMessages((current) => [
            ...current,
            {
              id: `assistant-${Date.now()}`,
              role: "assistant",
              text: "Ticket creation cancelled. No RELAY data was changed.",
              sourceNote: "The guided draft was discarded without running a database write.",
            },
          ]);
          return;
        }

        const currentMissing = missingRelayAiTicketFields(ticketSequence);
        const expectedField = currentMissing[0];
        if (!expectedField) {
          setTicketSequence(null);
          return;
        }
        const sequenceResult = applyRelayAiTicketSequenceAnswer(
          ticketSequence,
          expectedField,
          question,
        );
        if (sequenceResult.error) {
          setTicketSequence(sequenceResult.draft);
          setMessages((current) => [
            ...current,
            {
              id: `assistant-${Date.now()}`,
              role: "assistant",
              text: `${sequenceResult.error} ${relayAiTicketFieldPrompt(expectedField)}`,
              sourceNote: "Guided ticket draft. No database write has occurred.",
            },
          ]);
          return;
        }

        const remaining = missingRelayAiTicketFields(sequenceResult.draft);
        if (remaining.length > 0) {
          setTicketSequence(sequenceResult.draft);
          const guidance = remaining[0] === "requestDetails"
            ? await getTicketPartsGuidance(sequenceResult.draft, false)
            : null;
          setMessages((current) => [
            ...current,
            {
              id: `assistant-${Date.now()}`,
              role: "assistant",
              text: `${guidance ? `${guidance.text}\n\n` : ""}${relayAiTicketFieldPrompt(remaining[0])}`,
              facts: guidance?.facts ?? [`${4 - remaining.length} of 4 fields collected`],
              sourceNote: `${guidance ? `${guidance.sourceNote} ` : ""}Guided ticket draft. Say “cancel” at any point to discard it.`,
            },
          ]);
          return;
        }

        await showTicketConfirmation(sequenceResult.draft, false);
        return;
      }

      const assignmentCommand = parseRelayAiAssignmentCommand(question);
      if (assignmentCommand) {
        const supabase = getSupabaseClient();
        if (!supabase) throw new Error("Supabase is not configured.");
        const assignmentDraft = await prepareRelayAiAssignment(supabase, assignmentCommand);
        setMessages((current) => [
          ...current,
          {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            text: "I found the job and admin account. Review the assignment below and confirm it before I update the ticket or notify the assignee.",
            assignmentAction: { draft: assignmentDraft, status: "pending" },
            sourceNote: "Preview only. The ticket and notifications have not been changed.",
          },
        ]);
        return;
      }

      const ticketDraft = parseRelayAiTicketDraft(question);
      if (ticketDraft) {
        if (ticketDraft.missing.length > 0) {
          setTicketSequence(ticketDraft.draft);
          const guidance = ticketDraft.missing[0] === "requestDetails"
            ? await getTicketPartsGuidance(ticketDraft.draft, false)
            : null;
          setMessages((current) => [
            ...current,
            {
              id: `assistant-${Date.now()}`,
              role: "assistant",
              text: `I’ll collect the required ticket fields one at a time. ${guidance ? `${guidance.text}\n\n` : ""}${relayAiTicketFieldPrompt(ticketDraft.missing[0])}`,
              facts: guidance?.facts ?? [`${4 - ticketDraft.missing.length} of 4 fields collected`],
              sourceNote: `${guidance ? `${guidance.sourceNote} ` : ""}Guided ticket draft. Say “cancel” at any point to discard it.`,
            },
          ]);
          return;
        }
        await showTicketConfirmation(ticketDraft.draft, true);
        return;
      }

      const machinePartQuestion = parseRelayAiMachinePartQuestion(question);
      if (machinePartQuestion) {
        const supabase = getSupabaseClient();
        if (!supabase) throw new Error("Supabase is not configured.");
        const { user, isAdmin } = await getCurrentUserWithRole(supabase, { forceFresh: true });
        if (!user || !isAdmin) throw new Error("Admin access is required for Takeuchi catalogue suggestions.");
        const answer = await buildRelayAiTicketPartsGuidance(supabase, {
          machineReference: machinePartQuestion.machineReference,
          requestDetails: machinePartQuestion.description,
        });
        setSyncedAt(new Date());
        setMessages((current) => [
          ...current,
          {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            text: answer.text,
            facts: answer.facts,
            sourceNote: answer.sourceNote,
          },
        ]);
        return;
      }

      const takeuchiPartQuestion = parseRelayAiTakeuchiPartQuestion(question);
      if (takeuchiPartQuestion) {
        const supabase = getSupabaseClient();
        if (!supabase) throw new Error("Supabase is not configured.");
        const { user, isAdmin } = await getCurrentUserWithRole(supabase, { forceFresh: true });
        if (!user || !isAdmin) throw new Error("Admin access is required for Takeuchi catalogue suggestions.");
        const answer = await answerRelayAiTakeuchiPartQuestion(supabase, takeuchiPartQuestion);
        setSyncedAt(new Date());
        setMessages((current) => [
          ...current,
          {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            text: answer.text,
            facts: answer.facts,
            sourceNote: answer.sourceNote,
          },
        ]);
        return;
      }

      const machineReference = parseRelayAiMachineReference(question);
      if (machineReference) {
        const supabase = getSupabaseClient();
        if (!supabase) throw new Error("Supabase is not configured.");
        const { user, isAdmin } = await getCurrentUserWithRole(supabase, { forceFresh: true });
        if (!user || !isAdmin) throw new Error("Admin access is required for RELAY AI.");
        const machine = await lookupMachineRegistryRecord(supabase, machineReference);
        const answer = answerMachineRegistryLookup(machineReference, machine);
        setSyncedAt(new Date());
        setMessages((current) => [
          ...current,
          {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            text: answer.text,
            facts: answer.facts,
            sourceNote: answer.sourceNote,
            copyText: answer.copyText,
          },
        ]);
        return;
      }

      const supabase = getSupabaseClient();
      if (!supabase) throw new Error("Supabase is not configured.");
      const { user, isAdmin } = await getCurrentUserWithRole(supabase, { forceFresh: true });
      if (!user || !isAdmin) throw new Error("Admin access is required for RELAY AI.");
      const exactAnswer = await answerRelayConsoleExactLookup(supabase, question);
      if (exactAnswer) {
        setSyncedAt(new Date());
        setMessages((current) => [
          ...current,
          {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            text: exactAnswer.text,
            facts: exactAnswer.facts,
            sourceNote: exactAnswer.sourceNote,
            download: exactAnswer.download,
            copyText: exactAnswer.copyText,
          },
        ]);
        return;
      }

      const snapshot = await getSnapshot();
      const answer = await answerRelayConsoleQuestion(question, snapshot);
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          text: answer.text,
          facts: answer.facts,
          sourceNote: answer.sourceNote,
          download: answer.download,
          copyText: answer.copyText,
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: `assistant-error-${Date.now()}`,
          role: "assistant",
          text: error instanceof Error ? error.message : "RELAY AI could not query the live dataset.",
        },
      ]);
    } finally {
      setIsThinking(false);
    }
  }

  function updateAssignmentAction(
    messageId: string,
    updater: (action: NonNullable<RelayAiMessage["assignmentAction"]>) => NonNullable<RelayAiMessage["assignmentAction"]>,
  ) {
    setMessages((current) => current.map((message) =>
      message.id === messageId && message.assignmentAction
        ? { ...message, assignmentAction: updater(message.assignmentAction) }
        : message,
    ));
  }

  async function confirmAssignment(messageId: string, assignmentDraft: RelayAiAssignmentDraft) {
    if (isThinking) return;
    updateAssignmentAction(messageId, (action) => ({ ...action, status: "submitting" }));
    setIsThinking(true);
    try {
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error("Supabase is not configured.");
      const result = await executeRelayAiAssignment(supabase, assignmentDraft);
      updateAssignmentAction(messageId, (action) => ({ ...action, status: "submitted" }));
      snapshotRef.current = null;
      snapshotPromiseRef.current = null;
      setSyncedAt(null);
      setMessages((current) => [
        ...current,
        {
          id: `assistant-assigned-${Date.now()}`,
          role: "assistant",
          text: `Job ${assignmentDraft.jobNumber} is now assigned to ${assignmentDraft.assigneeLabel}. ${assignmentDraft.assigneeFullName} has been sent a closeable RELAY AI assignment notification.${result.warnings.length ? `\n\nWarnings: ${result.warnings.join(" ")}` : ""}`,
          facts: ["Assignment saved", assignmentDraft.assigneeLabel, "Notification sent"],
          sourceNote: `Confirmed by ${result.actorName}. The assignment is recorded in the ticket activity chain.`,
        },
      ]);
    } catch (error) {
      updateAssignmentAction(messageId, (action) => ({ ...action, status: "pending" }));
      setMessages((current) => [
        ...current,
        {
          id: `assistant-error-${Date.now()}`,
          role: "assistant",
          text: error instanceof Error ? error.message : "The job could not be assigned.",
          sourceNote: "Assignment failed. No confirmation of a successful notification was recorded.",
        },
      ]);
    } finally {
      setIsThinking(false);
    }
  }

  function updateTicketAction(messageId: string, updater: (action: NonNullable<RelayAiMessage["ticketAction"]>) => NonNullable<RelayAiMessage["ticketAction"]>) {
    setMessages((current) => current.map((message) =>
      message.id === messageId && message.ticketAction
        ? { ...message, ticketAction: updater(message.ticketAction) }
        : message,
    ));
  }

  async function confirmTicket(messageId: string, ticketDraft: RelayAiTicketDraft) {
    if (isThinking || !ticketDraft.department) return;
    updateTicketAction(messageId, (action) => ({ ...action, status: "submitting" }));
    setIsThinking(true);
    try {
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error("Supabase is not configured.");
      const result = await createRelayAiTicket(supabase, ticketDraft);
      updateTicketAction(messageId, (action) => ({ ...action, status: "submitted" }));
      snapshotRef.current = null;
      snapshotPromiseRef.current = null;
      setSyncedAt(null);
      setMessages((current) => [
        ...current,
        {
          id: `assistant-created-${Date.now()}`,
          role: "assistant",
          text: `Ticket ${ticketDraft.jobNumber} was created as PENDING for ${ticketDraft.machineReference}. The machine reference was ${result.machineVerified ? "verified and its registry snapshot was attached" : "not found in the machine registry, so it remains unverified"}.\n\nOpen ticket: /tickets/${result.id}${result.warnings.length ? `\n\nWarnings: ${result.warnings.join(" ")}` : ""}`,
          facts: ["Ticket submitted", "PENDING", result.machineVerified ? "Machine verified" : "Machine unverified"],
          sourceNote: `Created by ${result.requesterName} after explicit confirmation.`,
        },
      ]);
    } catch (error) {
      updateTicketAction(messageId, (action) => ({ ...action, status: "pending" }));
      setMessages((current) => [
        ...current,
        {
          id: `assistant-error-${Date.now()}`,
          role: "assistant",
          text: error instanceof Error ? error.message : "The ticket could not be created.",
          sourceNote: "Submission failed. Review the draft before trying again.",
        },
      ]);
    } finally {
      setIsThinking(false);
    }
  }

  async function downloadReport(download: NonNullable<RelayAiMessage["download"]>) {
    if (download.workbook) {
      const XLSX = await import("xlsx");
      const worksheet = XLSX.utils.aoa_to_sheet(download.workbook.rows);
      worksheet["!cols"] = download.workbook.rows[0]?.map((_, columnIndex) => ({
        wch: Math.min(48, Math.max(12, ...download.workbook!.rows.map((row) => String(row[columnIndex] ?? "").length))),
      }));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, download.workbook.sheetName);
      XLSX.writeFile(workbook, download.filename);
      return;
    }
    if (!download.content) return;
    const url = URL.createObjectURL(new Blob([download.content], { type: download.mimeType }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = download.filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function startNewChat() {
    setMessages([STARTER_MESSAGE]);
    setDraft("");
    setTicketSequence(null);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  if (!isOpen) return null;

  return (
    <>
      <button type="button" className="relay-ai-scrim" aria-label="Close RELAY AI" onClick={onClose} />
      <section className="relay-ai-panel" role="dialog" aria-modal="true" aria-labelledby="relay-ai-title">
        <header className="relay-ai-header">
          <div className="relay-ai-brand-mark" aria-hidden="true">
            <span />
            <ConsoleIcon name="message" className="h-5 w-5" />
          </div>
          <div className="relay-ai-heading">
            <p>Operations intelligence</p>
            <h2 id="relay-ai-title">RELAY AI</h2>
          </div>
          <div className="relay-ai-header-actions">
            <button type="button" onClick={startNewChat} className="relay-ai-header-button" disabled={isThinking}>
              New chat
            </button>
            <button type="button" onClick={onClose} className="console-icon-button" aria-label="Close RELAY AI">
              <ConsoleIcon name="close" className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="relay-ai-status-bar">
          <span className="relay-ai-status-dot" />
          <span>Local semantic engine</span>
          <i />
          <span>{syncedAt ? `Supabase synced ${syncedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : "Queries live data on first question"}</span>
          <i />
          <span>5 min cache · bounded reads</span>
        </div>

        <div className="relay-ai-conversation" aria-live="polite">
          <div className="relay-ai-conversation-inner">
            {messages.map((message) => (
              <article key={message.id} className={`relay-ai-message relay-ai-message-${message.role}`}>
                <div className="relay-ai-message-avatar" aria-hidden="true">
                  {message.role === "assistant" ? "R" : "You"}
                </div>
                <div className="relay-ai-message-content">
                  <p className="relay-ai-message-author">{message.role === "assistant" ? "RELAY AI" : "You"}</p>
                  <div className="relay-ai-message-text">{message.text}</div>
                  {message.facts?.length ? (
                    <div className="relay-ai-facts">
                      {message.facts.map((fact) => <span key={fact}>{fact}</span>)}
                    </div>
                  ) : null}
                  {message.download ? (
                    <button type="button" className="relay-ai-download" onClick={() => void downloadReport(message.download!)}>
                      <ConsoleIcon name="file" className="h-4 w-4" />
                      {message.download.label || "Download CSV report"}
                    </button>
                  ) : null}
                  {message.copyText ? (
                    <button
                      type="button"
                      className="relay-ai-download"
                      onClick={() => void navigator.clipboard.writeText(message.copyText!)}
                    >
                      <ConsoleIcon name="file" className="h-4 w-4" />
                      Copy machine details
                    </button>
                  ) : null}
                  {message.assignmentAction ? (
                    <div className={`relay-ai-ticket-review relay-ai-ticket-review-${message.assignmentAction.status}`}>
                      <div className="relay-ai-ticket-review-heading">
                        <div>
                          <span>Pending action</span>
                          <strong>Assign job {message.assignmentAction.draft.jobNumber}</strong>
                        </div>
                        <b>{message.assignmentAction.status === "submitted" ? "Submitted" : message.assignmentAction.status === "cancelled" ? "Cancelled" : "Requires confirmation"}</b>
                      </div>
                      <dl>
                        <div><dt>Job number</dt><dd>{message.assignmentAction.draft.jobNumber}</dd></div>
                        <div><dt>Machine</dt><dd>{message.assignmentAction.draft.machineReference || "Not recorded"}</dd></div>
                        <div><dt>Current assignee</dt><dd>{message.assignmentAction.draft.currentAssignee || "Unassigned"}</dd></div>
                        <div><dt>New assignee</dt><dd>{message.assignmentAction.draft.assigneeLabel} ({message.assignmentAction.draft.assigneeFullName})</dd></div>
                        <div className="relay-ai-ticket-review-wide"><dt>Request</dt><dd>{message.assignmentAction.draft.requestSummary}</dd></div>
                        <div className="relay-ai-ticket-review-wide"><dt>Notification</dt><dd>Closeable popup: “Job {message.assignmentAction.draft.jobNumber} assigned by RELAY AI”</dd></div>
                      </dl>
                      {message.assignmentAction.status === "pending" ? (
                        <div className="relay-ai-ticket-review-actions">
                          <button
                            type="button"
                            className="relay-ai-ticket-confirm"
                            disabled={isThinking}
                            onClick={() => void confirmAssignment(message.id, message.assignmentAction!.draft)}
                          >
                            Confirm assignment and notify
                          </button>
                          <button
                            type="button"
                            className="relay-ai-ticket-cancel"
                            onClick={() => updateAssignmentAction(message.id, (action) => ({ ...action, status: "cancelled" }))}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {message.ticketAction ? (
                    <div className={`relay-ai-ticket-review relay-ai-ticket-review-${message.ticketAction.status}`}>
                      <div className="relay-ai-ticket-review-heading">
                        <div>
                          <span>Pending action</span>
                          <strong>Create parts ticket</strong>
                        </div>
                        <b>{message.ticketAction.status === "submitted" ? "Submitted" : message.ticketAction.status === "cancelled" ? "Cancelled" : "Requires confirmation"}</b>
                      </div>
                      <dl>
                        <div><dt>Job number</dt><dd>{message.ticketAction.draft.jobNumber}</dd></div>
                        <div><dt>Machine</dt><dd>{message.ticketAction.draft.machineReference}</dd></div>
                        <div><dt>Requester</dt><dd>Signed-in administrator</dd></div>
                        <div>
                          <dt>Department</dt>
                          <dd>
                            <select
                              aria-label="Ticket department"
                              value={message.ticketAction.draft.department}
                              disabled={message.ticketAction.status !== "pending"}
                              onChange={(event) => updateTicketAction(message.id, (action) => ({
                                ...action,
                                draft: { ...action.draft, department: event.target.value as RelayAiTicketDraft["department"] },
                              }))}
                            >
                              <option value="">Choose department</option>
                              <option value="Yard">Yard</option>
                              <option value="Onsite">Onsite</option>
                            </select>
                          </dd>
                        </div>
                        <div className="relay-ai-ticket-review-wide"><dt>Request</dt><dd>{message.ticketAction.draft.requestDetails}</dd></div>
                        <div><dt>Initial status</dt><dd>PENDING</dd></div>
                      </dl>
                      {message.ticketAction.status === "pending" ? (
                        <div className="relay-ai-ticket-review-actions">
                          <button
                            type="button"
                            className="relay-ai-ticket-confirm"
                            disabled={!message.ticketAction.draft.department || isThinking}
                            onClick={() => void confirmTicket(message.id, message.ticketAction!.draft)}
                          >
                            Confirm and submit ticket
                          </button>
                          <button
                            type="button"
                            className="relay-ai-ticket-cancel"
                            onClick={() => updateTicketAction(message.id, (action) => ({ ...action, status: "cancelled" }))}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {message.sourceNote ? (
                    <p className="relay-ai-source">
                      <ConsoleIcon name="file" className="h-3.5 w-3.5" />
                      {message.sourceNote}
                    </p>
                  ) : null}
                </div>
              </article>
            ))}

            {messages.length === 1 ? (
              <div className="relay-ai-suggestions">
                <p>Try asking</p>
                <div>
                  {SUGGESTED_QUESTIONS.map((question) => (
                    <button key={question} type="button" onClick={() => void submitQuestion(question)}>
                      {question}
                      <ConsoleIcon name="chevron" className="h-4 w-4" />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {isThinking ? (
              <article className="relay-ai-message relay-ai-message-assistant">
                <div className="relay-ai-message-avatar" aria-hidden="true">R</div>
                <div className="relay-ai-message-content">
                  <p className="relay-ai-message-author">RELAY AI</p>
                  <div className="relay-ai-thinking"><span /><span /><span /></div>
                </div>
              </article>
            ) : null}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <footer className="relay-ai-composer-wrap">
          <div className="relay-ai-composer">
            <textarea
              ref={inputRef}
              rows={1}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void submitQuestion();
                }
              }}
              placeholder="Ask about a job, PO, report, or prepare a ticket..."
              disabled={isThinking}
            />
            <button
              type="button"
              onClick={() => void submitQuestion()}
              disabled={!draft.trim() || isThinking}
              aria-label="Send question"
            >
              <ConsoleIcon name="chevron" className="h-5 w-5 -rotate-90" />
            </button>
          </div>
          <p>Analytics use bounded, cached reads. Ticket actions require explicit confirmation and your signed-in permissions.</p>
        </footer>
      </section>
    </>
  );
}
