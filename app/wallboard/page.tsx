"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { activeTicketStatuses } from "@/lib/statuses";
import { getSupabaseClient } from "@/lib/supabase";

type WallboardTicket = {
  id: string;
  job_number: string | null;
  machine_reference: string | null;
  requester_name: string | null;
  request_summary: string | null;
  request_details: string | null;
  assigned_to: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type WallboardMode = "inbound" | "ready";

const MODE_DURATION_MS = 1000 * 60 * 5;
const POLL_INTERVAL_MS = 1000 * 30;
const MAX_VISIBLE_TICKETS = 8;

export default function WallboardPage() {
  const [tickets, setTickets] = useState<WallboardTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentMode, setCurrentMode] = useState<WallboardMode>("inbound");
  const [modeStartedAt, setModeStartedAt] = useState(() => Date.now());
  const [countdownNow, setCountdownNow] = useState(() => Date.now());
  const signatureRef = useRef("");
  const modeStartedAtRef = useRef(modeStartedAt);

  useEffect(() => {
    modeStartedAtRef.current = modeStartedAt;
  }, [modeStartedAt]);

  useEffect(() => {
    let isActive = true;

    async function loadTickets() {
      const supabase = getSupabaseClient();

      if (!supabase || !isActive) {
        return;
      }

      const { data, error } = await supabase
        .from("tickets")
        .select(
          "id, job_number, machine_reference, requester_name, request_summary, request_details, assigned_to, status, created_at, updated_at",
        )
        .in("status", activeTicketStatuses)
        .order("updated_at", { ascending: false })
        .limit(80);

      if (!isActive) {
        return;
      }

      if (error) {
        setLoadError("Unable to load the live queue.");
        setIsLoading(false);
        return;
      }

      const nextTickets = (data ?? []) as WallboardTicket[];
      const nextSignature = nextTickets
        .map((ticket) =>
          [
            ticket.id,
            ticket.status,
            ticket.updated_at,
            ticket.assigned_to,
            ticket.request_summary,
          ].join(":"),
        )
        .join("|");

      if (nextSignature !== signatureRef.current) {
        signatureRef.current = nextSignature;
        setTickets(nextTickets);
      }

      setLoadError(null);
      setLastUpdatedAt(new Date().toISOString());
      setIsLoading(false);
    }

    void loadTickets();

    const pollInterval = window.setInterval(() => {
      if (document.hidden) {
        return;
      }

      void loadTickets();
    }, POLL_INTERVAL_MS);

    const countdownInterval = window.setInterval(() => {
      const now = Date.now();
      setCountdownNow(now);

      if (now - modeStartedAtRef.current >= MODE_DURATION_MS) {
        setCurrentMode((previousMode) => (previousMode === "inbound" ? "ready" : "inbound"));
        setModeStartedAt(now);
      }
    }, 1000);

    function handleVisibilityChange() {
      if (!document.hidden) {
        void loadTickets();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isActive = false;
      window.clearInterval(pollInterval);
      window.clearInterval(countdownInterval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const inboundTickets = useMemo(() => {
    return [...tickets]
      .filter((ticket) => ticket.status !== "READY")
      .sort((left, right) => {
        const leftPriority = getInboundPriority(left.status);
        const rightPriority = getInboundPriority(right.status);

        if (leftPriority !== rightPriority) {
          return leftPriority - rightPriority;
        }

        return compareIsoDates(left.created_at, right.created_at);
      })
      .slice(0, MAX_VISIBLE_TICKETS);
  }, [tickets]);

  const readyTickets = useMemo(() => {
    return [...tickets]
      .filter((ticket) => ticket.status === "READY")
      .sort((left, right) => compareIsoDates(left.updated_at, right.updated_at))
      .slice(0, MAX_VISIBLE_TICKETS);
  }, [tickets]);

  const visibleTickets = currentMode === "inbound" ? inboundTickets : readyTickets;
  const secondsRemaining = Math.max(
    0,
    Math.ceil((MODE_DURATION_MS - (countdownNow - modeStartedAt)) / 1000),
  );
  const nextModeLabel = currentMode === "inbound" ? "Ready Queue" : "Inbound Queue";

  return (
    <AuthGuard requiredRole="admin">
      <main className="aurora-shell overflow-hidden px-8 py-8 text-white">
        <div className="aurora-shell-inner max-w-[120rem] space-y-6">
          <header className="rounded-[2rem] border border-white/12 bg-black/28 px-8 py-6 backdrop-blur-md">
            <div className="flex items-center justify-between gap-6">
              <div className="flex items-center gap-5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/aurora-logo-build.gif"
                  alt="Aurora Systems"
                  className="h-24 w-24 object-contain"
                />
                <div className="space-y-2">
                  <p className="text-sm font-semibold uppercase tracking-[0.38em] text-white/55">
                    Relay Wallboard
                  </p>
                  <h1 className="text-5xl font-semibold tracking-[0.12em] text-white">
                    {currentMode === "inbound" ? "Inbound Queue" : "Ready Queue"}
                  </h1>
                  <p className="text-lg text-white/70">
                    Live office view for the 40&quot; operations screen
                  </p>
                </div>
              </div>

              <div className="grid min-w-[24rem] grid-cols-3 gap-3">
                <WallboardMetric
                  label="Pending / Attention"
                  value={inboundTickets.length}
                  accent="red"
                />
                <WallboardMetric
                  label="Ready to Collect"
                  value={readyTickets.length}
                  accent="green"
                />
                <WallboardMetric
                  label={`Next: ${nextModeLabel}`}
                  value={formatCountdown(secondsRemaining)}
                  accent="neutral"
                />
              </div>
            </div>
          </header>

          <section className="grid min-h-[66vh] gap-4 md:grid-cols-2 xl:grid-cols-4">
            {visibleTickets.length > 0 ? (
              visibleTickets.map((ticket) => (
                <article
                  key={`${currentMode}-${ticket.id}`}
                  className={getWallboardCardClass(ticket.status)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.34em] text-white/45">
                        Job
                      </p>
                      <p className="mt-2 text-4xl font-semibold tracking-[0.08em] text-white">
                        {ticket.job_number ?? "Unassigned"}
                      </p>
                    </div>
                    <span className={getStatusBadgeClass(ticket.status)}>
                      {ticket.status ?? "UNKNOWN"}
                    </span>
                  </div>

                  <div className="mt-6 space-y-4">
                    <WallboardMeta label="Machine" value={ticket.machine_reference ?? "Not set"} />
                    <WallboardMeta
                      label="Requested By"
                      value={ticket.requester_name ?? "Unknown requester"}
                    />
                    <WallboardMeta
                      label={currentMode === "ready" ? "Prepared By" : "Assigned To"}
                      value={ticket.assigned_to ?? "Awaiting assignment"}
                    />
                  </div>

                  <div className="mt-6">
                    <p className="text-xs font-semibold uppercase tracking-[0.34em] text-white/45">
                      Request
                    </p>
                    <p className="mt-3 max-h-[8.5rem] overflow-hidden text-2xl leading-tight text-white/92">
                      {ticket.request_summary ?? ticket.request_details ?? "No summary provided"}
                    </p>
                  </div>

                  <div className="mt-auto pt-6 text-sm font-medium uppercase tracking-[0.2em] text-white/52">
                    {currentMode === "ready" ? "Ready since" : "Waiting since"}{" "}
                    {formatRelativeAge(ticket.updated_at ?? ticket.created_at)}
                  </div>
                </article>
              ))
            ) : (
              <div className="col-span-full flex min-h-[50vh] items-center justify-center rounded-[2rem] border border-white/10 bg-black/20 px-8 py-12 text-center backdrop-blur-sm">
                <div className="space-y-3">
                  <p className="text-sm font-semibold uppercase tracking-[0.38em] text-white/45">
                    {currentMode === "inbound" ? "Inbound Queue" : "Ready Queue"}
                  </p>
                  <p className="text-4xl font-semibold text-white">
                    {isLoading
                      ? "Loading live tickets..."
                      : loadError ?? "No live tickets in this queue right now"}
                  </p>
                </div>
              </div>
            )}
          </section>

          <footer className="flex items-center justify-between rounded-[2rem] border border-white/10 bg-black/22 px-6 py-4 text-sm text-white/60 backdrop-blur-sm">
            <p>
              Refreshes every {Math.floor(POLL_INTERVAL_MS / 1000)} seconds. Designed for low-load
              TV display in Chrome.
            </p>
            <p>
              {lastUpdatedAt ? `Last synced ${formatClock(lastUpdatedAt)}` : "Waiting for first sync"}
            </p>
          </footer>
        </div>
      </main>
    </AuthGuard>
  );
}

function WallboardMetric({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent: "red" | "green" | "neutral";
}) {
  const accentClass =
    accent === "red"
      ? "border-red-400/30 bg-red-500/14 text-red-100"
      : accent === "green"
        ? "border-emerald-400/28 bg-emerald-500/14 text-emerald-100"
        : "border-white/10 bg-white/6 text-white";

  return (
    <div className={`rounded-[1.5rem] border px-4 py-4 backdrop-blur-sm ${accentClass}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-white/55">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-[0.06em]">{value}</p>
    </div>
  );
}

function WallboardMeta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.32em] text-white/42">{label}</p>
      <p className="mt-2 text-xl text-white/90">{value}</p>
    </div>
  );
}

function getInboundPriority(status: string | null) {
  switch (status) {
    case "PENDING":
      return 0;
    case "QUERY":
      return 1;
    case "QUOTE":
      return 2;
    case "ESTIMATE":
      return 3;
    case "IN_PROGRESS":
      return 4;
    case "ORDERED":
      return 5;
    default:
      return 6;
  }
}

function compareIsoDates(left: string | null, right: string | null) {
  return new Date(left ?? 0).getTime() - new Date(right ?? 0).getTime();
}

function getWallboardCardClass(status: string | null) {
  const baseClass =
    "flex min-h-[24rem] flex-col rounded-[2rem] border px-6 py-6 backdrop-blur-sm transition-transform";

  switch (status) {
    case "PENDING":
      return `${baseClass} border-red-400/40 bg-red-500/14 shadow-[0_0_0_1px_rgba(248,113,113,0.16),0_0_36px_rgba(239,68,68,0.18)] animate-[wallboard-alert_1.8s_ease-in-out_infinite]`;
    case "QUERY":
      return `${baseClass} border-orange-300/40 bg-orange-500/12 shadow-[0_0_0_1px_rgba(251,146,60,0.16),0_0_32px_rgba(249,115,22,0.14)] animate-[wallboard-warning_2.2s_ease-in-out_infinite]`;
    case "READY":
      return `${baseClass} border-emerald-300/38 bg-emerald-500/12 shadow-[0_0_0_1px_rgba(52,211,153,0.14),0_0_34px_rgba(16,185,129,0.18)]`;
    default:
      return `${baseClass} border-white/10 bg-black/24 shadow-[0_24px_80px_-48px_rgba(0,0,0,0.75)]`;
  }
}

function getStatusBadgeClass(status: string | null) {
  const baseClass =
    "inline-flex min-h-[2.75rem] items-center justify-center rounded-full border px-4 py-2 text-sm font-semibold tracking-[0.18em]";

  switch (status) {
    case "PENDING":
      return `${baseClass} border-red-300/35 bg-red-500/18 text-red-100 animate-[wallboard-alert_1.8s_ease-in-out_infinite]`;
    case "QUERY":
      return `${baseClass} border-orange-300/35 bg-orange-500/18 text-orange-100 animate-[wallboard-warning_2.2s_ease-in-out_infinite]`;
    case "READY":
      return `${baseClass} border-emerald-300/35 bg-emerald-500/16 text-emerald-100 shadow-[0_0_18px_rgba(16,185,129,0.22)]`;
    default:
      return `${baseClass} border-white/10 bg-white/8 text-white/82`;
  }
}

function formatRelativeAge(isoDate: string | null) {
  if (!isoDate) {
    return "just now";
  }

  const elapsedMs = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.max(1, Math.floor(elapsedMs / (1000 * 60)));

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} hr`;
  }

  const days = Math.floor(hours / 24);
  return `${days} day`;
}

function formatClock(isoDate: string) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoDate));
}

function formatCountdown(secondsRemaining: number) {
  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
