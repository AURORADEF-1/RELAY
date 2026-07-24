"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { ConsoleIcon } from "@/components/console/console-icon";
import { ConsoleShell } from "@/components/console/console-shell";
import { StatusBadge } from "@/components/status-badge";
import {
  formatConsoleDate,
  formatConsoleDateTime,
} from "@/lib/console-tickets";
import {
  groupTicketsByBin,
  normalizePrePickSearch,
  type PrePickTicket,
} from "@/lib/pre-pick";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import { activeTicketStatuses } from "@/lib/statuses";
import { getSupabaseClient } from "@/lib/supabase";

type PrePickFilter = "ALL" | "READY" | "ORDERED" | "URGENT";

const PRE_PICK_FIELDS = [
  "id",
  "job_number",
  "status",
  "bin_location",
  "machine_reference",
  "machine_number",
  "request_summary",
  "request_details",
  "requester_name",
  "assigned_to",
  "expected_delivery_date",
  "is_urgent",
  "updated_at",
].join(",");

export default function PrePickPage() {
  const [tickets, setTickets] = useState<PrePickTicket[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<PrePickFilter>("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const loadTickets = useCallback(async (fullLoader = false) => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setErrorMessage("Supabase environment variables are not configured.");
      setIsLoading(false);
      return;
    }

    if (fullLoader) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      const { user, isAdmin } = await getCurrentUserWithRole(supabase);
      if (!user || !isAdmin) {
        throw new Error("Admin access is required to open Pre-Pick.");
      }

      const { data, error } = await supabase
        .from("tickets")
        .select(PRE_PICK_FIELDS)
        .in("status", [...activeTicketStatuses])
        .not("bin_location", "is", null)
        .order("bin_location", { ascending: true })
        .order("updated_at", { ascending: false })
        .limit(300);
      if (error) throw new Error(error.message);

      setTickets(
        ((data ?? []) as unknown as PrePickTicket[]).filter(
          (ticket) => Boolean(ticket.bin_location?.trim()),
        ),
      );
      setErrorMessage("");
      setLastSyncedAt(new Date());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load Pre-Pick.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadTickets(true);
  }, [loadTickets]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    let refreshTimer: number | null = null;
    const channel = supabase
      .channel("relay-pre-pick")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tickets" },
        () => {
          if (refreshTimer) window.clearTimeout(refreshTimer);
          refreshTimer = window.setTimeout(() => void loadTickets(false), 350);
        },
      )
      .subscribe();

    return () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [loadTickets]);

  const visibleTickets = useMemo(() => {
    const query = normalizePrePickSearch(searchQuery);
    return tickets.filter((ticket) => {
      if (filter === "URGENT" && !ticket.is_urgent) return false;
      if (filter === "READY" && ticket.status !== "READY") return false;
      if (filter === "ORDERED" && ticket.status !== "ORDERED") return false;
      if (!query) return true;
      return [
        ticket.bin_location,
        ticket.job_number,
        ticket.machine_number,
        ticket.machine_reference,
        ticket.request_summary,
        ticket.request_details,
        ticket.requester_name,
        ticket.assigned_to,
      ].some((value) => normalizePrePickSearch(value).includes(query));
    });
  }, [filter, searchQuery, tickets]);

  const bins = useMemo(() => groupTicketsByBin(visibleTickets), [visibleTickets]);
  const readyCount = tickets.filter((ticket) => ticket.status === "READY").length;
  const urgentCount = tickets.filter((ticket) => ticket.is_urgent).length;

  return (
    <AuthGuard requiredRole="admin">
      <ConsoleShell
        title="Pre-Pick"
        eyebrow="RELAY stores"
        searchValue={searchQuery}
        searchPlaceholder="Search bin, job, machine, requester or assignee"
        onSearchChange={setSearchQuery}
        contentClassName="console-content-prepick"
        actions={
          <button
            type="button"
            className="console-command-action"
            onClick={() => void loadTickets(false)}
            disabled={isLoading || isRefreshing}
          >
            <ConsoleIcon name="refresh" className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            <span>{isRefreshing ? "Syncing" : "Refresh"}</span>
          </button>
        }
      >
        <header className="prepick-page-header">
          <div>
            <p className="prepick-kicker">Virtual bin board</p>
            <h1>Pre-Pick</h1>
            <p>Locate staged requests by their recorded bin position and open the live job without leaving the stores view.</p>
          </div>
          <div className="prepick-live-state">
            <i aria-hidden="true" />
            <span>
              {lastSyncedAt
                ? `Live · synced ${lastSyncedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
                : "Connecting to live bins"}
            </span>
          </div>
        </header>

        <section className="prepick-metrics" aria-label="Pre-Pick summary">
          <PrePickMetric label="Occupied bins" value={String(groupTicketsByBin(tickets).length)} detail="Locations with active jobs" />
          <PrePickMetric label="Staged requests" value={String(tickets.length)} detail="Active jobs with a bin" />
          <PrePickMetric label="Ready" value={String(readyCount)} detail="Available for collection" tone="green" />
          <PrePickMetric label="Urgent" value={String(urgentCount)} detail="Priority staged jobs" tone="red" />
        </section>

        <section className="prepick-toolbar">
          <div>
            <span>Bin workspace</span>
            <strong>{bins.length} location{bins.length === 1 ? "" : "s"} · {visibleTickets.length} request{visibleTickets.length === 1 ? "" : "s"}</strong>
          </div>
          <div role="group" aria-label="Filter Pre-Pick requests">
            {(["ALL", "READY", "ORDERED", "URGENT"] as PrePickFilter[]).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={filter === option}
                onClick={() => setFilter(option)}
              >
                {option === "ALL" ? "All staged" : option.toLowerCase().replace(/^./, (value) => value.toUpperCase())}
              </button>
            ))}
          </div>
        </section>

        {errorMessage ? <div className="console-error-state">{errorMessage}</div> : null}

        {isLoading ? (
          <section className="prepick-bin-grid" aria-label="Loading bin locations">
            {Array.from({ length: 6 }).map((_, index) => <div className="prepick-bin-skeleton" key={index} />)}
          </section>
        ) : bins.length === 0 ? (
          <section className="prepick-empty-state">
            <ConsoleIcon name="prepick" className="h-7 w-7" />
            <h2>No staged requests found</h2>
            <p>{tickets.length === 0 ? "No active requests currently have a bin location." : "Adjust the search or filter to show the available bins."}</p>
          </section>
        ) : (
          <section className="prepick-bin-grid" aria-label="Virtual bin locations">
            {bins.map((bin) => (
              <article
                className="prepick-bin"
                data-ready={bin.tickets.some((ticket) => ticket.status === "READY")}
                key={bin.key}
              >
                <header>
                  <div className="prepick-bin-icon" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                  <div>
                    <span>Bin location</span>
                    <h2>{bin.label}</h2>
                  </div>
                  <b>{bin.tickets.length}</b>
                </header>
                <div className="prepick-bin-slots">
                  {bin.tickets.map((ticket) => (
                    <Link href={`/tickets/${ticket.id}`} className="prepick-job-slot" key={ticket.id}>
                      <div className="prepick-job-topline">
                        <strong>JOB {ticket.job_number?.trim() || "—"}</strong>
                        <StatusBadge status={ticket.status ?? "PENDING"} />
                      </div>
                      <p>{ticket.request_summary?.trim() || ticket.request_details?.trim() || "Request details not recorded"}</p>
                      <dl>
                        <div>
                          <dt>Machine</dt>
                          <dd>{ticket.machine_number?.trim() || ticket.machine_reference?.trim() || "—"}</dd>
                        </div>
                        <div>
                          <dt>Assigned</dt>
                          <dd>{ticket.assigned_to?.trim() || "Unassigned"}</dd>
                        </div>
                        <div>
                          <dt>Requester</dt>
                          <dd>{ticket.requester_name?.trim() || "—"}</dd>
                        </div>
                        <div>
                          <dt>Expected</dt>
                          <dd>{formatConsoleDate(ticket.expected_delivery_date)}</dd>
                        </div>
                      </dl>
                      <footer>
                        <span>{ticket.is_urgent ? "Urgent · " : ""}Updated {formatConsoleDateTime(ticket.updated_at)}</span>
                        <strong>Open ticket <ConsoleIcon name="chevron" className="h-3.5 w-3.5" /></strong>
                      </footer>
                    </Link>
                  ))}
                </div>
              </article>
            ))}
          </section>
        )}
      </ConsoleShell>
    </AuthGuard>
  );
}

function PrePickMetric({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "green" | "red";
}) {
  return (
    <article className="prepick-metric" data-tone={tone}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}
