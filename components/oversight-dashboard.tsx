"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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
type ActivityEvent = {
  user_id: string;
  session_id: string | null;
  event_type: "ticket_closed" | "order_placed";
  amount: number | null;
  occurred_at: string;
};
type PageActivity = {
  id: string;
  user_id: string;
  session_id: string;
  route_path: string;
  ticket_id: string | null;
  started_at: string;
  last_seen_at: string;
};
type Ticket = {
  id: string;
  job_number: string | null;
  request_summary: string | null;
  machine_reference: string | null;
};

type DailyUserStats = {
  activities: PageActivity[];
  sessionIds: Set<string>;
  trackedSeconds: number;
  ticketsClosed: number;
  orderValue: number;
};

const ACTIVE_WINDOW_MS = 75_000;

function getLocalDateValue() {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function getDateRange(value: string) {
  const start = new Date(`${value}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function secondsBetween(start: string, end: string) {
  return Math.max(0, Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000));
}

function liveDuration(from: string | null, now: number) {
  if (!from) return "—";
  return formatTrackedTime(Math.max(0, Math.floor((now - new Date(from).getTime()) / 1000)));
}

function formatTrackedTime(seconds: number) {
  if (seconds <= 0) return "—";
  if (seconds < 60) return "<1 min";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes} min`;
}

function formatClock(value: string) {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatLastSeen(value: string, now: number) {
  const seconds = Math.max(0, Math.floor((now - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : formatClock(value);
}

function money(value: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value);
}

function routeLabel(path: string | null) {
  if (!path) return "Awaiting current page";
  if (path.startsWith("/tickets/")) return "Ticket details";
  const labels: Record<string, string> = {
    "/": "Home",
    "/console": "Operations console",
    "/admin": "Parts control",
    "/completed": "Completed tickets",
    "/reports": "Reports",
    "/pre-pick": "Pre-Pick",
    "/fleet": "Fleet",
    "/filters": "Filter lookup",
    "/incidents": "Workshop",
    "/parts-knowledge": "Parts knowledge",
    "/requests": "My requests",
    "/stores": "Stores self-service",
    "/submit": "New request",
    "/tasks": "Tasks",
  };
  return labels[path] ?? (path.replace(/^\//, "").replaceAll("-", " ") || "Home");
}

function createEmptyStats(): DailyUserStats {
  return { activities: [], sessionIds: new Set(), trackedSeconds: 0, ticketsClosed: 0, orderValue: 0 };
}

export function OversightDashboard() {
  const [selectedDate, setSelectedDate] = useState(getLocalDateValue);
  const [presence, setPresence] = useState<Presence[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [pageActivity, setPageActivity] = useState<PageActivity[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const range = getDateRange(selectedDate);

    const [presenceResult, profileResult, eventResult, activityResult] = await Promise.all([
      supabase
        .from("user_presence")
        .select("user_id, session_id, session_started_at, route_path, current_ticket_id, page_opened_at, last_seen_at")
        .order("last_seen_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name, role"),
      supabase
        .from("oversight_activity_events")
        .select("user_id, session_id, event_type, amount, occurred_at")
        .gte("occurred_at", range.start)
        .lt("occurred_at", range.end),
      supabase
        .from("oversight_page_activity")
        .select("id, user_id, session_id, route_path, ticket_id, started_at, last_seen_at")
        .lt("started_at", range.end)
        .gte("last_seen_at", range.start)
        .order("started_at", { ascending: false }),
    ]);

    const firstError = presenceResult.error ?? profileResult.error ?? eventResult.error ?? activityResult.error;
    if (firstError) throw firstError;

    const nextPresence = (presenceResult.data ?? []) as Presence[];
    const nextActivity = (activityResult.data ?? []) as PageActivity[];
    const ticketIds = Array.from(new Set([
      ...nextPresence.map((row) => row.current_ticket_id),
      ...nextActivity.map((row) => row.ticket_id),
    ].filter((id): id is string => Boolean(id))));
    const ticketResult = ticketIds.length
      ? await supabase
          .from("tickets")
          .select("id, job_number, request_summary, machine_reference")
          .in("id", ticketIds)
      : { data: [], error: null };
    if (ticketResult.error) throw ticketResult.error;

    setPresence(nextPresence);
    setProfiles((profileResult.data ?? []) as Profile[]);
    setEvents((eventResult.data ?? []) as ActivityEvent[]);
    setPageActivity(nextActivity);
    setTickets((ticketResult.data ?? []) as Ticket[]);
    setError("");
  }, [selectedDate]);

  useEffect(() => {
    const initial = window.setTimeout(() => {
      void refresh().catch((refreshError) => {
        setError(refreshError instanceof Error ? refreshError.message : "Unable to load Oversight activity.");
      });
    }, 0);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    const poll = window.setInterval(() => void refresh().catch(() => undefined), 20_000);
    const supabase = getSupabaseClient();
    const channel = supabase
      ?.channel("relay-oversight-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "user_presence" }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "oversight_page_activity" }, () => void refresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "oversight_activity_events" }, () => void refresh())
      .subscribe();

    return () => {
      window.clearTimeout(initial);
      window.clearInterval(clock);
      window.clearInterval(poll);
      if (channel) void supabase?.removeChannel(channel);
    };
  }, [refresh]);

  const dashboard = useMemo(() => {
    const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
    const presenceById = new Map(presence.map((row) => [row.user_id, row]));
    const ticketsById = new Map(tickets.map((ticket) => [ticket.id, ticket]));
    const statsByUser = new Map<string, DailyUserStats>();

    for (const activity of pageActivity) {
      const stats = statsByUser.get(activity.user_id) ?? createEmptyStats();
      stats.activities.push(activity);
      stats.sessionIds.add(activity.session_id);
      stats.trackedSeconds += secondsBetween(activity.started_at, activity.last_seen_at);
      statsByUser.set(activity.user_id, stats);
    }

    for (const event of events) {
      const stats = statsByUser.get(event.user_id) ?? createEmptyStats();
      if (event.event_type === "ticket_closed") stats.ticketsClosed += 1;
      if (event.event_type === "order_placed") stats.orderValue += Number(event.amount ?? 0);
      statsByUser.set(event.user_id, stats);
    }

    const userIds = new Set(statsByUser.keys());
    for (const row of presence) {
      const isActive = Boolean(row.session_id && row.route_path) && now - new Date(row.last_seen_at).getTime() < ACTIVE_WINDOW_MS;
      if (isActive) userIds.add(row.user_id);
    }

    const rows = Array.from(userIds).map((userId) => {
      const current = presenceById.get(userId);
      const active = Boolean(current?.session_id && current.route_path) && now - new Date(current?.last_seen_at ?? 0).getTime() < ACTIVE_WINDOW_MS;
      return {
        userId,
        profile: profilesById.get(userId),
        presence: current,
        active,
        currentTicket: current?.current_ticket_id ? ticketsById.get(current.current_ticket_id) : undefined,
        stats: statsByUser.get(userId) ?? createEmptyStats(),
      };
    }).sort((left, right) => {
      if (left.active !== right.active) return left.active ? -1 : 1;
      return (right.presence?.last_seen_at ?? "").localeCompare(left.presence?.last_seen_at ?? "");
    });

    return {
      rows,
      ticketsById,
      activeCount: rows.filter((row) => row.active).length,
      trackedUsers: statsByUser.size,
      ticketsClosed: rows.reduce((sum, row) => sum + row.stats.ticketsClosed, 0),
      orderValue: rows.reduce((sum, row) => sum + row.stats.orderValue, 0),
    };
  }, [events, now, pageActivity, presence, profiles, tickets]);

  return (
    <main className="min-h-screen bg-[#07110f] text-white">
      <header className="border-b border-white/10 bg-[#0a1714]/95 px-6 py-5">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-emerald-300">RELAY secure operations</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight">Oversight</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-sm font-bold text-slate-200">
              Activity date
              <input type="date" value={selectedDate} max={getLocalDateValue()} onChange={(event) => setSelectedDate(event.target.value)} className="rounded-md bg-slate-900 px-2 py-1 text-white" />
            </label>
            <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-4 py-2 text-sm font-bold text-emerald-200">● Live</span>
            <Link href="/console" className="rounded-xl border border-white/15 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-white/10">Back to RELAY</Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] px-6 py-8">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Active now" value={String(dashboard.activeCount)} accent />
          <Metric label="Users tracked · selected day" value={String(dashboard.trackedUsers)} />
          <Metric label="Tickets closed · selected day" value={String(dashboard.ticketsClosed)} />
          <Metric label="Ordered · selected day" value={money(dashboard.orderValue)} />
        </section>

        <p className="mt-4 text-sm text-slate-400">
          Live location updates every 20 seconds. Daily history records each page visit and the active time spent there.
        </p>
        {error ? <p className="mt-6 rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-rose-200">{error}</p> : null}

        <section className="mt-7 space-y-5">
          {dashboard.rows.map((row) => (
            <article key={row.userId} className={`overflow-hidden rounded-[1.6rem] border bg-white/[0.055] shadow-xl ${row.active ? "border-emerald-300/35" : "border-white/10"}`}>
              <div className="grid lg:grid-cols-[1.15fr_1fr]">
                <div className="border-b border-white/10 p-5 lg:border-b-0 lg:border-r">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-black">{row.profile?.full_name || "RELAY user"}</h2>
                      <p className="mt-1 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">{row.profile?.role || "user"}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-black ${row.active ? "bg-emerald-400/15 text-emerald-200" : "bg-white/10 text-slate-400"}`}>
                      {row.active ? "ACTIVE NOW" : row.presence ? `Last seen ${formatLastSeen(row.presence.last_seen_at, now)}` : "OFFLINE"}
                    </span>
                  </div>

                  <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-300">{row.active ? "Current page" : "Last recorded page"}</p>
                    <p className="mt-2 text-xl font-black capitalize">{routeLabel(row.presence?.route_path ?? null)}</p>
                    {row.currentTicket ? (
                      <Link href={`/tickets/${row.currentTicket.id}`} className="mt-3 block rounded-xl border border-white/10 bg-white/[0.04] p-3 hover:border-emerald-300/30">
                        <strong className="text-lg">Ticket #{row.currentTicket.job_number || "—"}</strong>
                        <span className="mt-1 block text-sm text-slate-300">{row.currentTicket.request_summary || row.currentTicket.machine_reference || "Ticket details"}</span>
                      </Link>
                    ) : null}
                    <p className="mt-3 text-sm text-slate-400">
                      {row.active ? "On this page " : "Page was open "}
                      <strong className="text-white">{row.active ? liveDuration(row.presence?.page_opened_at ?? null, now) : formatTrackedTime(row.stats.activities[0] ? secondsBetween(row.stats.activities[0].started_at, row.stats.activities[0].last_seen_at) : 0)}</strong>
                    </p>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <SessionDatum label="Tracked time" value={formatTrackedTime(row.stats.trackedSeconds)} />
                    <SessionDatum label="Sessions" value={String(row.stats.sessionIds.size)} />
                    <SessionDatum label="Closed" value={String(row.stats.ticketsClosed)} />
                    <SessionDatum label="Ordered" value={money(row.stats.orderValue)} />
                  </div>
                </div>

                <div className="p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Daily activity log</p>
                  <div className="mt-4 space-y-2">
                    {row.stats.activities.slice(0, 8).map((activity) => {
                      const ticket = activity.ticket_id ? dashboard.ticketsById.get(activity.ticket_id) : undefined;
                      return (
                        <div key={activity.id} className="flex items-center justify-between gap-4 rounded-xl border border-white/8 bg-black/15 px-4 py-3">
                          <div className="min-w-0">
                            <p className="truncate font-bold capitalize">{routeLabel(activity.route_path)}{ticket?.job_number ? ` · #${ticket.job_number}` : ""}</p>
                            <p className="mt-1 text-xs text-slate-500">Opened {formatClock(activity.started_at)}</p>
                          </div>
                          <strong className="shrink-0 text-sm text-slate-200">{formatTrackedTime(secondsBetween(activity.started_at, activity.last_seen_at))}</strong>
                        </div>
                      );
                    })}
                    {!row.stats.activities.length ? <p className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-slate-500">No page history recorded for this date.</p> : null}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </section>

        {!dashboard.rows.length && !error ? <p className="mt-12 text-center text-slate-400">No activity has been recorded for this date.</p> : null}
      </div>
    </main>
  );
}

function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-5 ${accent ? "border-emerald-300/30 bg-emerald-400/10" : "border-white/10 bg-white/[0.05]"}`}>
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-black">{value}</p>
    </div>
  );
}

function SessionDatum({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 font-black text-slate-100">{value}</p>
    </div>
  );
}
