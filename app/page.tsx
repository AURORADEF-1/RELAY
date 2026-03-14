"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { NotificationBadge } from "@/components/notification-badge";
import { useNotifications } from "@/components/notification-provider";
import { LogoutButton } from "@/components/logout-button";
import { RelayLogo } from "@/components/relay-logo";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import { getSupabaseClient } from "@/lib/supabase";

type HomepageUpdate = {
  id: string;
  job_number: string | null;
  request_summary: string | null;
  request_details: string | null;
  status: string | null;
  updated_at: string | null;
};

type HomepageTicket = HomepageUpdate & {
  assigned_to: string | null;
  requester_name: string | null;
};

const mockUpdates: HomepageUpdate[] = [
  {
    id: "mock-1",
    job_number: "1191",
    request_summary: "Engine harness",
    request_details: null,
    status: "ORDERED",
    updated_at: new Date(Date.now() - 1000 * 60 * 24).toISOString(),
  },
  {
    id: "mock-2",
    job_number: "2044",
    request_summary: "Hydraulic fitting set",
    request_details: null,
    status: "READY",
    updated_at: new Date(Date.now() - 1000 * 60 * 58).toISOString(),
  },
  {
    id: "mock-3",
    job_number: "3187",
    request_summary: "Cooling fan assembly",
    request_details: null,
    status: "QUERY",
    updated_at: new Date(Date.now() - 1000 * 60 * 132).toISOString(),
  },
];

export default function Home() {
  const { requesterUnreadCount, adminBadgeCount, isAdmin } = useNotifications();
  const [updates, setUpdates] = useState<HomepageUpdate[]>(mockUpdates);
  const [updatesMode, setUpdatesMode] = useState<"live" | "mock">("mock");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [searchTickets, setSearchTickets] = useState<HomepageTicket[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState<{
    title: string;
    detail: string;
    status?: string | null;
  } | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadHomepageUpdates() {
      const supabase = getSupabaseClient();

      if (!supabase) {
        return;
      }

      const { user, role } = await getCurrentUserWithRole(supabase);

      if (!isMounted || !user) {
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();

      const query = supabase
        .from("tickets")
        .select(
          "id, job_number, request_summary, request_details, status, updated_at, assigned_to, requester_name",
        )
        .order("updated_at", { ascending: false })
        .limit(role === "admin" ? 8 : 5);

      const { data, error } =
        role === "admin" ? await query : await query.eq("user_id", user.id);

      if (!isMounted) {
        return;
      }

      setIsLoggedIn(true);
      setDisplayName(resolveDisplayName(profile?.full_name, user.email));

      if (!error && data && data.length > 0) {
        const tickets = data as HomepageTicket[];
        setUpdates(tickets);
        setSearchTickets(tickets);
        setUpdatesMode("live");
      }
    }

    loadHomepageUpdates();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadSessionState() {
      const supabase = getSupabaseClient();

      if (!supabase) {
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (isMounted) {
        setIsLoggedIn(Boolean(session));
      }
    }

    loadSessionState();

    return () => {
      isMounted = false;
    };
  }, []);

  function handleQuickSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearchResult(resolveQuickSearch(searchQuery, searchTickets));
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#f8fafc_0%,#eef2f7_48%,#e2e8f0_100%)] px-6 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <nav className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-[1.75rem] border border-white/70 bg-white/80 px-5 py-4 shadow-[0_18px_55px_-34px_rgba(15,23,42,0.35)] backdrop-blur">
          <RelayLogo />
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-600">
            {!isLoggedIn ? (
              <Link
                href="/login"
                className="rounded-full px-4 py-2 transition hover:bg-slate-100"
              >
                Login
              </Link>
            ) : null}
            <Link
              href="/submit"
              className="rounded-full px-4 py-2 transition hover:bg-slate-100"
            >
              Submit Ticket
            </Link>
            <Link
              href="/requests"
              className="rounded-full px-4 py-2 transition hover:bg-slate-100"
            >
              My Requests
              <NotificationBadge count={requesterUnreadCount} />
            </Link>
            {isAdmin ? (
              <Link
                href="/admin"
                className="rounded-full px-4 py-2 transition hover:bg-slate-100"
              >
                Admin Dashboard
                <NotificationBadge count={adminBadgeCount} />
              </Link>
            ) : null}
            <LogoutButton />
          </div>
        </nav>

        <div className="flex min-h-[calc(100vh-9rem)] items-center">
          <section className="w-full overflow-hidden rounded-[2rem] border border-white/80 bg-white/90 shadow-[0_28px_80px_-32px_rgba(15,23,42,0.35)] backdrop-blur">
            <div className="grid gap-8 px-8 py-10 sm:px-10 sm:py-12 lg:grid-cols-[1.08fr_0.92fr] lg:px-12 lg:py-14">
              <div className="flex flex-col justify-between gap-8">
                <div className="space-y-8">
                  <div className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-[11px] font-semibold tracking-[0.24em] text-slate-600">
                    Internal Control Point
                  </div>

                  <div className="space-y-4">
                    {isLoggedIn && displayName ? (
                      <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500">
                        Hello, {displayName}
                      </p>
                    ) : null}
                    <h1 className="text-8xl font-semibold tracking-[-0.12em] text-slate-950 sm:text-[7rem] lg:text-[9.5rem]">
                      RELAY
                    </h1>
                    <p className="max-w-lg text-lg font-medium tracking-[-0.02em] text-slate-600">
                      Parts requests, updates, and operator activity in one view.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <Link
                    href="/submit"
                    className="inline-flex h-12 items-center justify-center rounded-xl bg-slate-950 px-6 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    Submit Ticket
                  </Link>
                  <Link
                    href="/requests"
                    className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-6 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                  >
                    View My Requests
                    <NotificationBadge count={requesterUnreadCount} />
                  </Link>
                  {isAdmin ? (
                    <Link
                      href="/admin"
                      className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-300 bg-slate-50 px-6 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-white"
                    >
                      Admin Dashboard
                      <NotificationBadge count={adminBadgeCount} />
                    </Link>
                  ) : null}
                </div>

                <form
                  onSubmit={handleQuickSearch}
                  className="rounded-3xl border border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] p-5"
                >
                  <div className="space-y-2">
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Quick Search
                    </p>
                    <p className="text-sm leading-6 text-slate-500">
                      Ask about a job number or search request status instantly.
                    </p>
                  </div>
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <input
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Try: Is job 1191 done?"
                      className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400"
                    />
                    <button
                      type="submit"
                      className="inline-flex h-12 items-center justify-center rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      Search
                    </button>
                  </div>
                  {searchResult ? (
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {searchResult.title}
                          </p>
                          <p className="mt-2 text-sm leading-6 text-slate-600">
                            {searchResult.detail}
                          </p>
                        </div>
                        {searchResult.status ? (
                          <StatusPill status={searchResult.status} />
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </form>
              </div>

              <aside className="rounded-[1.75rem] border border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] p-6 sm:p-7">
                <div className="space-y-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Recent Updates
                      </p>
                      <p className="text-sm leading-6 text-slate-500">
                        {updatesMode === "live"
                          ? "Latest activity from your requests."
                          : "Recent request activity snapshot."}
                      </p>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {updatesMode}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {updates.map((update) => (
                      <RequestUpdateItem key={update.id} update={update} />
                    ))}
                  </div>
                </div>
              </aside>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function RequestUpdateItem({ update }: { update: HomepageUpdate }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-[0_18px_40px_-36px_rgba(15,23,42,0.55)]">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Job {update.job_number || "Not set"}
          </p>
          <p className="text-sm font-semibold text-slate-900">
            {update.request_summary || update.request_details || "Request update"}
          </p>
        </div>
        <StatusPill status={update.status ?? "PENDING"} />
      </div>
      <p className="mt-3 text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
        Updated {formatRelativeTime(update.updated_at)}
      </p>
    </article>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone = getStatusTone(status);

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] ${tone}`}
    >
      <span className="h-2 w-2 rounded-full bg-current opacity-70" />
      {status}
    </span>
  );
}

function getStatusTone(status: string) {
  switch (status) {
    case "QUERY":
      return "border-orange-200 bg-orange-50 text-orange-900";
    case "ORDERED":
      return "border-sky-200 bg-sky-50 text-sky-900";
    case "READY":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "COMPLETED":
      return "border-slate-200 bg-slate-100 text-slate-800";
    default:
      return "border-amber-200 bg-amber-50 text-amber-900";
  }
}

function formatRelativeTime(value: string | null) {
  if (!value) {
    return "recently";
  }

  const minutes = Math.max(
    1,
    Math.round((Date.now() - new Date(value).getTime()) / 1000 / 60),
  );

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.round(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function resolveDisplayName(fullName?: string | null, email?: string | null) {
  if (fullName?.trim()) {
    return fullName.trim();
  }

  if (email?.includes("@")) {
    return email.split("@")[0];
  }

  return "User";
}

function resolveQuickSearch(query: string, tickets: HomepageTicket[]) {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return {
      title: "Quick Search",
      detail: "Enter a job number or ask about the status of a request.",
      status: null,
    };
  }

  const jobNumberMatch = query.match(/[A-Za-z0-9-]{3,}/);
  const matchedTicket = tickets.find((ticket) => {
    const jobNumber = ticket.job_number?.toLowerCase();
    const summary = (ticket.request_summary || ticket.request_details || "").toLowerCase();

    if (jobNumberMatch && jobNumber === jobNumberMatch[0].toLowerCase()) {
      return true;
    }

    return summary.includes(normalized);
  });

  if (!matchedTicket) {
    return {
      title: "No matching request found",
      detail: "Try a job number or a clearer request phrase.",
      status: null,
    };
  }

  const summary =
    matchedTicket.request_summary || matchedTicket.request_details || "No request summary recorded.";
  const status = matchedTicket.status ?? "PENDING";
  const updated = formatRelativeTime(matchedTicket.updated_at);

  if (normalized.includes("done") || normalized.includes("complete")) {
    return {
      title: `Job ${matchedTicket.job_number || matchedTicket.id}`,
      detail:
        status === "COMPLETED"
          ? `${summary} is completed. Last updated ${updated}.`
          : `${summary} is not completed. Current status is ${status}. Last updated ${updated}.`,
      status,
    };
  }

  if (
    normalized.includes("status") ||
    normalized.includes("ready") ||
    normalized.includes("ordered") ||
    normalized.includes("query")
  ) {
    return {
      title: `Job ${matchedTicket.job_number || matchedTicket.id}`,
      detail: `${summary}. Current status is ${status}. Last updated ${updated}.`,
      status,
    };
  }

  return {
    title: `Job ${matchedTicket.job_number || matchedTicket.id}`,
    detail: `${summary}. Assigned to ${matchedTicket.assigned_to || "Stores queue"}. Current status is ${status}.`,
    status,
  };
}
