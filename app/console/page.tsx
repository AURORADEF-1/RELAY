"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { ConsoleIcon } from "@/components/console/console-icon";
import { ConsoleDynamicTicketCard } from "@/components/console/console-dynamic-ticket-card";
import { ConsoleShell } from "@/components/console/console-shell";
import { ConsoleTicketCard } from "@/components/console/console-ticket-card";
import { ConsoleTicketDrawer } from "@/components/console/console-ticket-drawer";
import {
  type ConsoleTicket,
  type ConsoleTicketUpdate,
  formatConsoleCurrency,
  mergeLatestTicketNotes,
} from "@/lib/console-tickets";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import { activeTicketStatuses } from "@/lib/statuses";
import { getSupabaseClient } from "@/lib/supabase";

const CONSOLE_TICKET_FIELDS = [
  "id",
  "requester_name",
  "department",
  "machine_reference",
  "machine_number",
  "machine_make",
  "machine_model",
  "machine_serial_number",
  "machine_verified",
  "job_number",
  "request_summary",
  "request_details",
  "status",
  "assigned_to",
  "expected_delivery_date",
  "supplier_name",
  "purchase_order_number",
  "order_amount",
  "bin_location",
  "notes",
  "is_urgent",
  "created_at",
  "updated_at",
].join(", ");

const CONSOLE_VIEW_STORAGE_KEY = "relay-operations-console-view-v1";

type StatusFilter = "ALL" | (typeof activeTicketStatuses)[number];
type ConsoleView = "list" | "dynamic";

export default function ConsolePage() {
  const [tickets, setTickets] = useState<ConsoleTicket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [view, setView] = useState<ConsoleView>(() => {
    if (typeof window === "undefined") {
      return "list";
    }

    return window.localStorage.getItem(CONSOLE_VIEW_STORAGE_KEY) === "dynamic"
      ? "dynamic"
      : "list";
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const closeTicketDrawer = useCallback(() => setSelectedTicketId(null), []);

  const loadTickets = useCallback(async (showFullLoader = false) => {
    const supabase = getSupabaseClient();

    if (!supabase) {
      setErrorMessage("Supabase environment variables are not configured.");
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    if (showFullLoader) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    try {
      const { user, isAdmin } = await getCurrentUserWithRole(supabase);
      if (!user || !isAdmin) {
        setErrorMessage("Admin access is required to open the operations console.");
        return;
      }

      const { data: ticketData, error: ticketError } = await supabase
        .from("tickets")
        .select(CONSOLE_TICKET_FIELDS)
        .in("status", [...activeTicketStatuses])
        .order("is_urgent", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(200);

      if (ticketError) {
        throw new Error(ticketError.message);
      }

      const rawTickets = (ticketData ?? []) as unknown as Omit<ConsoleTicket, "latest_note">[];
      const ticketIds = rawTickets.map((ticket) => ticket.id);
      let updates: ConsoleTicketUpdate[] = [];

      if (ticketIds.length > 0) {
        const { data: updateData, error: updateError } = await supabase
          .from("ticket_updates")
          .select("ticket_id, comment, created_at")
          .in("ticket_id", ticketIds)
          .order("created_at", { ascending: false });

        if (updateError) {
          throw new Error(updateError.message);
        }

        updates = (updateData ?? []) as ConsoleTicketUpdate[];
      }

      setTickets(mergeLatestTicketNotes(rawTickets, updates));
      setErrorMessage("");
      setLastSyncedAt(new Date());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load the live ticket queue.");
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
    if (!supabase) {
      return;
    }

    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleReload = () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
      refreshTimer = setTimeout(() => void loadTickets(false), 350);
    };

    const channel = supabase
      .channel("relay-operations-console")
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, scheduleReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "ticket_updates" }, scheduleReload)
      .subscribe();

    return () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
      void supabase.removeChannel(channel);
    };
  }, [loadTickets]);

  const filteredTickets = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return tickets.filter((ticket) => {
      if (statusFilter !== "ALL" && ticket.status !== statusFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      return [
        ticket.job_number,
        ticket.request_summary,
        ticket.request_details,
        ticket.machine_reference,
        ticket.requester_name,
        ticket.assigned_to,
        ticket.supplier_name,
        ticket.purchase_order_number,
        ticket.latest_note,
      ].some((value) => value?.toLowerCase().includes(query));
    });
  }, [searchQuery, statusFilter, tickets]);

  const selectedTicket = tickets.find((ticket) => ticket.id === selectedTicketId) ?? null;
  const urgentCount = tickets.filter((ticket) => ticket.is_urgent).length;
  const dueCount = tickets.filter((ticket) => {
    if (!ticket.expected_delivery_date) {
      return false;
    }
    const due = new Date(ticket.expected_delivery_date);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    return !Number.isNaN(due.getTime()) && due <= endOfToday;
  }).length;
  const openValue = tickets.reduce((total, ticket) => total + (ticket.order_amount ?? 0), 0);

  return (
    <AuthGuard requiredRole="admin">
      <ConsoleShell
        title="Operations console"
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        actions={
          <button
            type="button"
            onClick={() => void loadTickets(false)}
            disabled={isLoading || isRefreshing}
            className="console-command-action"
          >
            <ConsoleIcon name="refresh" className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            <span>{isRefreshing ? "Syncing" : "Refresh"}</span>
          </button>
        }
      >
        <section className="console-overview-strip" aria-label="Operations summary">
          <ConsoleMetric label="Active tickets" value={String(tickets.length)} detail="Across the live queue" />
          <ConsoleMetric label="Urgent" value={String(urgentCount)} detail="Pinned for attention" tone="danger" />
          <ConsoleMetric label="Due / overdue" value={String(dueCount)} detail="Expected by end of today" tone="warning" />
          <ConsoleMetric label="Open order value" value={formatConsoleCurrency(openValue)} detail="Recorded against active tickets" />
        </section>

        <section className="console-queue-panel">
          <div className="console-queue-toolbar">
            <div>
              <p className="console-section-label">Live ticket queue</p>
              <h2>{filteredTickets.length} visible requests</h2>
              <p>
                {lastSyncedAt
                  ? `Last synced ${lastSyncedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
                  : "Connecting to Supabase"}
              </p>
            </div>
            <div className="console-queue-controls">
              <div className="console-view-switch" role="group" aria-label="Ticket view">
                {(["list", "dynamic"] as ConsoleView[]).map((option) => (
                  <button
                    type="button"
                    key={option}
                    className={view === option ? "console-view-switch-active" : undefined}
                    onClick={() => {
                      setView(option);
                      window.localStorage.setItem(CONSOLE_VIEW_STORAGE_KEY, option);
                    }}
                    aria-pressed={view === option}
                  >
                    {option === "list" ? "List view" : "Dynamic view"}
                  </button>
                ))}
              </div>
              <div className="console-status-filters" role="group" aria-label="Filter by status">
                {(["ALL", ...activeTicketStatuses] as StatusFilter[]).map((status) => (
                  <button
                    type="button"
                    key={status}
                    data-status={status}
                    onClick={() => setStatusFilter(status)}
                    className={statusFilter === status ? "console-status-filter-active" : undefined}
                    aria-pressed={statusFilter === status}
                  >
                    <i className="console-status-filter-dot" aria-hidden="true" />
                    {status.replaceAll("_", " ")}
                    <span className="console-status-filter-count">
                      {status === "ALL" ? tickets.length : tickets.filter((ticket) => ticket.status === status).length}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {errorMessage ? <div className="console-error-state">{errorMessage}</div> : null}

          {isLoading ? (
            <div className={view === "dynamic" ? "console-dynamic-grid" : "console-ticket-list"} aria-label="Loading tickets">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="console-ticket-skeleton" />
              ))}
            </div>
          ) : filteredTickets.length === 0 ? (
            <div className="console-empty-state">
              <ConsoleIcon name="search" className="h-5 w-5" />
              <div>
                <h3>No matching tickets</h3>
                <p>Adjust the status filter or search terms to return to the active queue.</p>
              </div>
            </div>
          ) : (
            <div className={view === "dynamic" ? "console-dynamic-grid" : "console-ticket-list"}>
              {filteredTickets.map((ticket) =>
                view === "dynamic" ? (
                  <ConsoleDynamicTicketCard
                    key={ticket.id}
                    ticket={ticket}
                    selected={selectedTicketId === ticket.id}
                    onSelect={() => setSelectedTicketId(ticket.id)}
                  />
                ) : (
                  <ConsoleTicketCard
                    key={ticket.id}
                    ticket={ticket}
                    selected={selectedTicketId === ticket.id}
                    onSelect={() => setSelectedTicketId(ticket.id)}
                  />
                ),
              )}
            </div>
          )}
        </section>

        <ConsoleTicketDrawer ticket={selectedTicket} onClose={closeTicketDrawer} />
      </ConsoleShell>
    </AuthGuard>
  );
}

function ConsoleMetric({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "warning" | "danger";
}) {
  return (
    <div className={`console-metric console-metric-${tone}`}>
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{detail}</span>
    </div>
  );
}
