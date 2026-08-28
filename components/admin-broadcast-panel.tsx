"use client";

import { useState } from "react";
import { ConsoleIcon } from "@/components/console/console-icon";
import { getSupabaseAccessToken, getSupabaseClient } from "@/lib/supabase";
import {
  getRelayBroadcastPreset,
  normalizeRelayBroadcastDraft,
  relayBroadcastKinds,
  type RelayBroadcastKind,
} from "@/lib/system-broadcast";

const broadcastKindLabels: Record<RelayBroadcastKind, string> = {
  update: "Product update",
  maintenance: "Maintenance",
  notice: "General notice",
};

export function AdminBroadcastPanel() {
  const initialPreset = getRelayBroadcastPreset("update");
  const [kind, setKind] = useState<RelayBroadcastKind>("update");
  const [title, setTitle] = useState(initialPreset.title);
  const [message, setMessage] = useState(initialPreset.message);
  const [isSending, setIsSending] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  function handleKindChange(nextKind: RelayBroadcastKind) {
    const preset = getRelayBroadcastPreset(nextKind);
    setKind(nextKind);
    setTitle(preset.title);
    setMessage(preset.message);
    setNotice(null);
  }

  async function handleSend() {
    setNotice(null);
    setIsSending(true);

    try {
      const draft = normalizeRelayBroadcastDraft({ kind, title, message });
      const accessToken = await getSupabaseAccessToken();
      if (!accessToken) throw new Error("Your RELAY session has expired. Sign in again.");

      const response = await fetch("/api/notifications/broadcast", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(draft),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        recipients?: number;
      };

      if (!response.ok) throw new Error(payload.error || "Unable to send the announcement.");

      const supabase = getSupabaseClient();
      if (supabase) {
        const channel = supabase.channel("relay-system-notifications");
        channel.subscribe((status) => {
          if (status !== "SUBSCRIBED") return;
          void channel
            .send({ type: "broadcast", event: "refresh", payload: {} })
            .finally(() => void supabase.removeChannel(channel));
        });
      }

      setNotice({
        tone: "success",
        message: `Announcement sent to ${payload.recipients ?? 0} RELAY user${payload.recipients === 1 ? "" : "s"}.`,
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to send the announcement.",
      });
    } finally {
      setIsSending(false);
    }
  }

  return (
    <section className="admin-control-panel admin-broadcast-panel" aria-labelledby="broadcast-heading">
      <div className="admin-broadcast-heading">
        <div>
          <p>All-user message</p>
          <h2 id="broadcast-heading">Broadcast across RELAY</h2>
          <span>Show a dismissible pop-up to every RELAY user on every app view.</span>
        </div>
        <ConsoleIcon name="message" className="h-5 w-5" />
      </div>

      <div className="admin-broadcast-kinds" aria-label="Announcement type">
        {relayBroadcastKinds.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => handleKindChange(option)}
            aria-pressed={kind === option}
          >
            {broadcastKindLabels[option]}
          </button>
        ))}
      </div>

      <label className="admin-broadcast-field">
        <span>Title</span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={120}
          placeholder="RELAY update"
        />
      </label>

      <label className="admin-broadcast-field">
        <span>Message</span>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={500}
          rows={3}
          placeholder="Enter the message all users should see."
        />
        <small>{message.length}/500</small>
      </label>

      <div className="admin-broadcast-actions">
        {notice ? <p data-tone={notice.tone}>{notice.message}</p> : <span>Messages remain visible until each user closes them.</span>}
        <button type="button" onClick={() => void handleSend()} disabled={isSending || !message.trim()}>
          <ConsoleIcon name="message" className="h-4 w-4" />
          {isSending ? "Sending…" : "Send to everyone"}
        </button>
      </div>
    </section>
  );
}
