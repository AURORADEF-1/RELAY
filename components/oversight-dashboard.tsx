"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase";

type Presence = {
  user_id: string;
  session_id: string | null;
  session_started_at: string | null;
  route_path: string | null;
  current_ticket_id: string | null;
  page_opened_at: string | null;
  last_seen_at: string;
};
type Profile = { id: string; full_name: string | null; role: string | null };
type Event = { user_id: string; session_id: string | null; event_type: "ticket_closed" | "order_placed"; amount: number | null; occurred_at: string };
type Ticket = { id: string; job_number: string | null; request_summary: string | null; machine_reference: string | null };

function duration(from: string | null, now: number) {
  if (!from) return "—";
  const seconds = Math.max(0, Math.floor((now - new Date(from).getTime()) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return hours ? `${hours}h ${minutes}m` : minutes ? `${minutes}m ${secs}s` : `${secs}s`;
}

function money(value: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value);
}

function routeLabel(path: string | null) {
  if (!path) return "No active page";
  if (path.startsWith("/tickets/")) return "Viewing ticket";
  const labels: Record<string, string> = { "/console": "Operations console", "/admin": "Parts control", "/reports": "Reports", "/pre-pick": "Pre-Pick", "/fleet": "Fleet", "/tasks": "Tasks" };
  return labels[path] ?? (path.replace(/^\//, "").replaceAll("-", " ") || "Home");
}

export function OversightDashboard() {
  const [presence, setPresence] = useState<Presence[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
    const [presenceResult, profileResult, eventResult] = await Promise.all([
      supabase.from("user_presence").select("user_id, session_id, session_started_at, route_path, current_ticket_id, page_opened_at, last_seen_at").order("last_seen_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name, role"),
      supabase.from("oversight_activity_events").select("user_id, session_id, event_type, amount, occurred_at").gte("occurred_at", since),
    ]);
    const firstError = presenceResult.error ?? profileResult.error ?? eventResult.error;
    if (firstError) throw firstError;
    const nextPresence = (presenceResult.data ?? []) as Presence[];
    const ticketIds = nextPresence.map((row) => row.current_ticket_id).filter(Boolean) as string[];
    const ticketResult = ticketIds.length
      ? await supabase.from("tickets").select("id, job_number, request_summary, machine_reference").in("id", ticketIds)
      : { data: [], error: null };
    if (ticketResult.error) throw ticketResult.error;
    setPresence(nextPresence);
    setProfiles((profileResult.data ?? []) as Profile[]);
    setEvents((eventResult.data ?? []) as Event[]);
    setTickets((ticketResult.data ?? []) as Ticket[]);
    setError("");
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => {
      void refresh().catch((err) => setError(err instanceof Error ? err.message : "Unable to load live activity."));
    }, 0);
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    const poll = window.setInterval(() => void refresh().catch(() => undefined), 20_000);
    const supabase = getSupabaseClient();
    const channel = supabase?.channel("relay-oversight-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "user_presence" }, () => void refresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "oversight_activity_events" }, () => void refresh())
      .subscribe();
    return () => {
      window.clearInterval(timer);
      window.clearInterval(poll);
      window.clearTimeout(initial);
      if (channel) void supabase?.removeChannel(channel);
    };
  }, [refresh]);

  const profilesById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const ticketsById = useMemo(() => new Map(tickets.map((ticket) => [ticket.id, ticket])), [tickets]);
  const rows = presence.map((row) => {
    const active = now - new Date(row.last_seen_at).getTime() < 60_000;
    const sessionEvents = events.filter((event) => event.user_id === row.user_id && event.session_id === row.session_id);
    return {
      ...row,
      active,
      profile: profilesById.get(row.user_id),
      ticket: row.current_ticket_id ? ticketsById.get(row.current_ticket_id) : undefined,
      closed: sessionEvents.filter((event) => event.event_type === "ticket_closed").length,
      ordered: sessionEvents.filter((event) => event.event_type === "order_placed").reduce((sum, event) => sum + Number(event.amount ?? 0), 0),
    };
  }).sort((a, b) => Number(b.active) - Number(a.active));

  const activeCount = rows.filter((row) => row.active).length;
  const closedTotal = rows.reduce((sum, row) => sum + row.closed, 0);
  const orderTotal = rows.reduce((sum, row) => sum + row.ordered, 0);

  return (
    <main className="min-h-screen bg-[#07110f] text-white">
      <header className="border-b border-white/10 bg-[#0a1714]/95 px-6 py-5">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-emerald-300">RELAY secure operations</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight">Oversight</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-4 py-2 text-sm font-bold text-emerald-200">● Live</span>
            <Link href="/console" className="rounded-xl border border-white/15 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-white/10">Back to RELAY</Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] px-6 py-8">
        <section className="grid gap-4 sm:grid-cols-3">
          <Metric label="Active now" value={String(activeCount)} accent />
          <Metric label="Tickets closed · live sessions" value={String(closedTotal)} />
          <Metric label="Ordered · live sessions" value={money(orderTotal)} />
        </section>

        {error ? <p className="mt-6 rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-rose-200">{error}</p> : null}

        <section className="mt-7 grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
          {rows.map((row) => (
            <article key={row.user_id} className={`overflow-hidden rounded-[1.6rem] border bg-white/[0.055] shadow-xl ${row.active ? "border-emerald-300/30" : "border-white/10 opacity-70"}`}>
              <div className="flex items-start justify-between gap-3 border-b border-white/10 p-5">
                <div>
                  <h2 className="text-xl font-black">{row.profile?.full_name || "RELAY user"}</h2>
                  <p className="mt-1 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">{row.profile?.role || "user"}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-black ${row.active ? "bg-emerald-400/15 text-emerald-200" : "bg-white/10 text-slate-400"}`}>{row.active ? "ACTIVE" : `Seen ${duration(row.last_seen_at, now)} ago`}</span>
              </div>

              <div className="p-5">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">Current activity</p>
                <p className="mt-2 text-lg font-bold capitalize">{routeLabel(row.route_path)}</p>
                {row.ticket ? (
                  <Link href={`/tickets/${row.ticket.id}`} className="mt-3 block rounded-xl border border-white/10 bg-black/20 p-4 hover:border-emerald-300/30">
                    <strong className="text-2xl">#{row.ticket.job_number || "Ticket"}</strong>
                    <span className="mt-1 block text-sm text-slate-300">{row.ticket.request_summary || row.ticket.machine_reference || "Ticket details"}</span>
                  </Link>
                ) : null}
                <p className="mt-4 text-sm text-slate-400">On this page for <strong className="text-white">{duration(row.page_opened_at, now)}</strong></p>
              </div>

              <div className="grid grid-cols-3 border-t border-white/10 bg-black/15">
                <SessionDatum label="Session" value={duration(row.session_started_at, now)} />
                <SessionDatum label="Closed" value={String(row.closed)} />
                <SessionDatum label="Ordered" value={money(row.ordered)} />
              </div>
            </article>
          ))}
        </section>

        {!rows.length && !error ? <p className="mt-12 text-center text-slate-400">No RELAY user sessions have reported activity yet.</p> : null}
      </div>
    </main>
  );
}

function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div className={`rounded-2xl border p-5 ${accent ? "border-emerald-300/30 bg-emerald-400/10" : "border-white/10 bg-white/[0.05]"}`}><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{label}</p><p className="mt-2 text-3xl font-black">{value}</p></div>;
}

function SessionDatum({ label, value }: { label: string; value: string }) {
  return <div className="border-r border-white/10 p-4 last:border-r-0"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{label}</p><p className="mt-1 font-black text-slate-100">{value}</p></div>;
}
