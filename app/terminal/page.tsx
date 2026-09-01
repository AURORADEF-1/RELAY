"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { AuthGuard } from "@/components/auth-guard";
import { LogoutButton } from "@/components/logout-button";
import {
  completeFrontCounterCollection,
  fetchFrontCounterCollectionQueue,
  FRONT_COUNTER_LIVE_CHANNEL,
  requestFrontCounterCollection,
  type FrontCounterCollectionRequest,
} from "@/lib/front-counter";
import { getSupabaseClient } from "@/lib/supabase";

type TerminalMode = "home" | "collect" | "handover";
type TerminalNotice = { tone: "success" | "error" | "info"; title: string; detail: string };

export default function TerminalPage() {
  const [mode, setMode] = useState<TerminalMode>("home");
  const [identifier, setIdentifier] = useState("");
  const [queue, setQueue] = useState<FrontCounterCollectionRequest[]>([]);
  const [notice, setNotice] = useState<TerminalNotice | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const liveChannelRef = useRef<RealtimeChannel | null>(null);

  const loadQueue = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    try {
      setQueue(await fetchFrontCounterCollectionQueue(supabase));
    } catch {
      // The primary terminal actions surface errors; a missed background refresh is non-blocking.
    }
  }, []);

  useEffect(() => {
    void loadQueue();
    const interval = window.setInterval(() => void loadQueue(), 10_000);
    const supabase = getSupabaseClient();
    const channel = supabase?.channel(FRONT_COUNTER_LIVE_CHANNEL)
      .on("postgres_changes", { event: "*", schema: "public", table: "front_counter_collection_requests" }, () => void loadQueue())
      .on("broadcast", { event: "refresh" }, () => void loadQueue())
      .subscribe();
    liveChannelRef.current = channel ?? null;
    return () => {
      window.clearInterval(interval);
      liveChannelRef.current = null;
      if (supabase && channel) void supabase.removeChannel(channel);
    };
  }, [loadQueue]);

  useEffect(() => {
    if (mode !== "home") window.setTimeout(() => inputRef.current?.focus(), 50);
  }, [mode]);

  async function handleSubmit() {
    const supabase = getSupabaseClient();
    if (!supabase || !identifier.trim() || isWorking) return;
    setIsWorking(true);
    setNotice(null);
    try {
      if (mode === "collect") {
        const result = await requestFrontCounterCollection(supabase, identifier);
        setNotice({
          tone: "success",
          title: `Job ${result.job_number} sent to Stores`,
          detail: `You are number ${result.queue_position} in the collection queue. Please wait at the counter while the parts team picks from bin ${result.bin_location || "shown in RELAY"}.`,
        });
      } else if (mode === "handover") {
        const result = await completeFrontCounterCollection(supabase, identifier);
        setNotice({
          tone: "success",
          title: `Job ${result.job_number} collected and completed`,
          detail: result.verified_label
            ? `The job-ticket barcode was verified and ${result.issued_labels} verified label${result.issued_labels === 1 ? " was" : "s were"} issued.`
            : `Collection was recorded. ${result.issued_labels} previously verified label${result.issued_labels === 1 ? " was" : "s were"} issued.`,
        });
      }
      setIdentifier("");
      void liveChannelRef.current?.send({
        type: "broadcast",
        event: "refresh",
        payload: { source: "front-counter-terminal" },
      });
      await loadQueue();
    } catch (error) {
      setNotice({
        tone: "error",
        title: mode === "collect" ? "Collection request not found" : "Handover not completed",
        detail: error instanceof Error ? error.message : "RELAY could not process that scan.",
      });
    } finally {
      setIsWorking(false);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  return (
    <AuthGuard requiredRole="front-counter">
      <main className="min-h-dvh bg-[radial-gradient(circle_at_top,#173d39_0%,#071311_44%,#020706_100%)] px-3 py-3 text-white sm:px-5 sm:py-4 md:px-7 md:py-6">
        <div className="mx-auto flex min-h-[calc(100dvh-1.5rem)] max-w-7xl flex-col sm:min-h-[calc(100dvh-2rem)] md:min-h-[calc(100dvh-3rem)]">
          <header className="flex items-center justify-between gap-4 rounded-3xl border border-white/10 bg-black/25 px-4 py-3 backdrop-blur-xl sm:px-5 sm:py-4 md:px-7">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.32em] text-emerald-300/75">RELAY Front Counter</p>
              <h1 className="mt-1 text-xl font-black tracking-tight sm:text-2xl md:text-3xl">Parts Terminal</h1>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/wallboard" className="rounded-2xl border border-white/15 bg-white/8 px-3 py-2.5 text-sm font-bold sm:px-4 sm:py-3">Wallboard</Link>
              <LogoutButton />
            </div>
          </header>

          {mode === "home" ? (
            <section className="grid flex-1 content-center gap-3 py-4 sm:gap-4 md:grid-cols-3 md:gap-5 md:py-6">
              <TerminalAction href="/submit" title="Submit a ticket" detail="Request a part for a machine or job." accent="blue" />
              <TerminalButton title="Collect parts" detail="Scan your RELAY label, collection code or enter the job number." accent="green" onClick={() => { setMode("collect"); setNotice(null); }} />
              <TerminalButton title="Parts team handover" detail="Scan the job ticket after the parts have been handed over." accent="amber" onClick={() => { setMode("handover"); setNotice(null); }} />
            </section>
          ) : (
            <section className="flex flex-1 flex-col justify-center py-5">
              <button type="button" onClick={() => { setMode("home"); setNotice(null); setIdentifier(""); }} className="mb-4 w-fit rounded-xl border border-white/15 bg-white/8 px-4 py-2 text-sm font-bold">← Back</button>
              <div className="rounded-[2rem] border border-white/12 bg-black/35 p-5 shadow-2xl backdrop-blur-xl sm:p-8">
                <p className="text-xs font-bold uppercase tracking-[0.28em] text-emerald-300/75">{mode === "collect" ? "Fitter collection" : "Parts team verification"}</p>
                <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">{mode === "collect" ? "Scan or enter your job" : "Scan the job ticket"}</h2>
                <p className="mt-3 max-w-3xl text-base leading-7 text-white/65 sm:text-lg">{mode === "collect" ? "Use the scanner, enter the job number, or enter the six-character collection code." : "Only scan after the correct parts have been handed to the fitter. This records collection and moves the ticket to COMPLETED."}</p>
                <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                  <input ref={inputRef} value={identifier} onChange={(event) => setIdentifier(event.target.value.toUpperCase())} onKeyDown={(event) => { if (event.key === "Enter") void handleSubmit(); }} autoComplete="off" placeholder="SCAN OR ENTER CODE" className="min-w-0 flex-1 rounded-2xl border-2 border-white/20 bg-white/8 px-5 py-5 font-mono text-xl font-black uppercase text-white outline-none placeholder:text-white/25 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-400/15 sm:text-2xl" />
                  <button type="button" onClick={() => void handleSubmit()} disabled={!identifier.trim() || isWorking} className="min-h-16 rounded-2xl bg-emerald-400 px-8 py-5 text-lg font-black text-emerald-950 disabled:opacity-40">{isWorking ? "Checking…" : mode === "collect" ? "Request collection" : "Verify & complete"}</button>
                </div>
                {notice ? <div className={`mt-5 rounded-2xl border p-5 ${notice.tone === "success" ? "border-emerald-300/45 bg-emerald-400/15" : notice.tone === "error" ? "border-red-300/45 bg-red-400/15" : "border-blue-300/45 bg-blue-400/15"}`}><p className="text-xl font-black">{notice.tone === "success" ? "✓ " : notice.tone === "error" ? "× " : "i "}{notice.title}</p><p className="mt-2 text-base leading-6 text-white/75">{notice.detail}</p></div> : null}
              </div>
            </section>
          )}

          <footer className="rounded-2xl border border-white/10 bg-black/25 px-4 py-2.5 text-xs text-white/55 sm:px-5 sm:py-3 sm:text-sm">
            <span className="font-bold text-white/80">{queue.length} waiting</span> at the Front Counter · Scanner input is accepted as keyboard input
          </footer>
        </div>
      </main>
    </AuthGuard>
  );
}

function TerminalAction({ href, title, detail, accent }: { href: string; title: string; detail: string; accent: "blue" | "green" | "amber" }) {
  return <Link href={href} className={terminalCardClass(accent)}><span className="text-xs font-bold uppercase tracking-[0.22em] text-white/55 sm:text-sm">Touch to begin</span><strong className="mt-3 text-2xl font-black sm:text-3xl md:mt-5 md:text-4xl">{title}</strong><span className="mt-2 text-sm leading-6 text-white/70 sm:text-base md:mt-3 md:leading-7">{detail}</span></Link>;
}

function TerminalButton({ title, detail, accent, onClick }: { title: string; detail: string; accent: "blue" | "green" | "amber"; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={terminalCardClass(accent)}><span className="text-xs font-bold uppercase tracking-[0.22em] text-white/55 sm:text-sm">Touch to begin</span><strong className="mt-3 text-left text-2xl font-black sm:text-3xl md:mt-5 md:text-4xl">{title}</strong><span className="mt-2 text-left text-sm leading-6 text-white/70 sm:text-base md:mt-3 md:leading-7">{detail}</span></button>;
}

function terminalCardClass(accent: "blue" | "green" | "amber") {
  const tone = accent === "blue" ? "border-blue-300/35 bg-blue-400/12 hover:bg-blue-400/20" : accent === "amber" ? "border-amber-300/35 bg-amber-400/12 hover:bg-amber-400/20" : "border-emerald-300/35 bg-emerald-400/12 hover:bg-emerald-400/20";
  return `flex min-h-44 flex-col justify-center rounded-[1.6rem] border p-5 shadow-xl transition active:scale-[0.99] sm:min-h-48 sm:rounded-[2rem] sm:p-6 md:min-h-64 md:p-7 ${tone}`;
}
