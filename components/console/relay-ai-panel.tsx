"use client";

import { useEffect, useRef, useState } from "react";
import { ConsoleIcon } from "@/components/console/console-icon";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import {
  answerRelayConsoleQuestion,
  loadRelayAnalyticsSnapshot,
  type RelayAnalyticsSnapshot,
} from "@/lib/relay-console-ai";
import { getSupabaseClient } from "@/lib/supabase";

type RelayAiMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
  facts?: string[];
  sourceNote?: string;
};

const STARTER_MESSAGE: RelayAiMessage = {
  id: "welcome",
  role: "assistant",
  text: "Ask me about operational demand, machines, suppliers, spend, requesters, departments, operator workload, overdue orders, urgent work or ready collections. I analyse live RELAY data using safe read-only queries.",
};

const SUGGESTED_QUESTIONS = [
  "Which machine reference has the highest requests?",
  "Who is our main supplier?",
  "What needs attention today?",
  "Show ready jobs and bin locations",
];

const CACHE_WINDOW_MS = 60_000;

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
  const snapshotRef = useRef<RelayAnalyticsSnapshot | null>(null);
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
    if (cached && Date.now() - cached.loadedAt.getTime() < CACHE_WINDOW_MS) return cached;

    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured.");
    const { user, isAdmin } = await getCurrentUserWithRole(supabase, { forceFresh: true });
    if (!user || !isAdmin) throw new Error("Admin access is required for RELAY AI.");

    const snapshot = await loadRelayAnalyticsSnapshot(supabase);
    snapshotRef.current = snapshot;
    setSyncedAt(snapshot.loadedAt);
    return snapshot;
  }

  async function submitQuestion(value = draft) {
    const question = value.trim();
    if (!question || isThinking) return;

    setDraft("");
    setMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, role: "user", text: question },
    ]);
    setIsThinking(true);

    try {
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

  function startNewChat() {
    setMessages([STARTER_MESSAGE]);
    setDraft("");
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
              placeholder="Ask RELAY about machines, suppliers, queues or spend..."
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
          <p>Read-only analytics. Answers use accessible RELAY records and may need operational verification.</p>
        </footer>
      </section>
    </>
  );
}
