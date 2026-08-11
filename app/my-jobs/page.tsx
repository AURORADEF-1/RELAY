"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { ConsoleIcon } from "@/components/console/console-icon";
import { ConsoleShell } from "@/components/console/console-shell";
import { MyJobStatusModal, type MyJobMove } from "@/components/my-jobs/my-job-status-modal";
import { getAdminAssignmentLabel } from "@/lib/admin-assignees";
import { isReportableAdminOperatorName } from "@/lib/admin-operators";
import { formatConsoleCurrency } from "@/lib/console-tickets";
import {
  formatTimeInStatus,
  getDefaultTargetStatus,
  getMyJobsColumnTickets,
  isMyJob,
  MY_JOBS_COLUMNS,
  type MyJobTicket,
  type MyJobsColumn,
} from "@/lib/my-jobs";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import { activeTicketStatuses } from "@/lib/statuses";
import { getSupabaseClient } from "@/lib/supabase";

const MY_JOBS_FIELDS = [
  "id", "user_id", "requester_name", "department", "machine_reference", "machine_number",
  "machine_make", "machine_model", "machine_serial_number", "machine_verified", "job_number",
  "request_summary", "request_details", "status", "assigned_to", "expected_delivery_date",
  "lead_time_note", "supplier_name", "supplier_email", "purchase_order_number", "order_amount",
  "ordered_at", "ordered_by", "bin_location", "ready_at", "ready_by", "notes", "is_urgent",
  "is_retail_sale", "retail_sales_reference", "customer_name", "customer_email", "customer_phone",
  "retail_delivery_method", "retail_delivery_address", "retail_apc_tracking_number", "created_at", "updated_at",
].join(", ");

export default function MyJobsPage() {
  const [tickets, setTickets] = useState<MyJobTicket[]>([]);
  const [operatorLabel, setOperatorLabel] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [move, setMove] = useState<MyJobMove | null>(null);
  const [draggedTicketId, setDraggedTicketId] = useState<string | null>(null);
  const [dropColumnId, setDropColumnId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [compactCards, setCompactCards] = useState(false);

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
      const { user, profile, isAdmin } = await getCurrentUserWithRole(supabase);
      if (!user || !isAdmin) throw new Error("Admin access is required to open My Jobs.");
      const displayName = profile?.display_name?.trim() || user.email?.split("@")[0] || "Administrator";
      const currentOperatorLabel = getAdminAssignmentLabel(displayName);
      if (!isReportableAdminOperatorName(currentOperatorLabel)) {
        throw new Error("Your RELAY admin profile needs a named operator before My Jobs can be used.");
      }
      const statuses = showCompleted ? ["COMPLETED"] : [...activeTicketStatuses];
      const { data, error } = await supabase
        .from("tickets")
        .select(MY_JOBS_FIELDS)
        .in("status", statuses)
        .order("is_urgent", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(300);
      if (error) throw new Error(error.message);

      const assignedTickets = ((data ?? []) as unknown as MyJobTicket[])
        .filter((ticket) => isMyJob(ticket, currentOperatorLabel))
        .map((ticket) => ({ ...ticket, latest_note: ticket.notes?.trim() || null }));
      setOperatorLabel(currentOperatorLabel);
      setTickets(assignedTickets);
      setErrorMessage("");
      setLastSyncedAt(new Date());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load your assigned jobs.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [showCompleted]);

  useEffect(() => {
    void loadTickets(true);
  }, [loadTickets]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel("relay-my-jobs")
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => void loadTickets(false), 300);
      })
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [loadTickets]);

  const visibleTickets = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return tickets;
    return tickets.filter((ticket) => [
      ticket.job_number,
      ticket.request_summary,
      ticket.request_details,
      ticket.machine_reference,
      ticket.machine_number,
      ticket.requester_name,
      ticket.supplier_name,
      ticket.purchase_order_number,
    ].some((value) => value?.toLowerCase().includes(query)));
  }, [searchQuery, tickets]);

  const urgentCount = tickets.filter((ticket) => ticket.is_urgent).length;
  const orderedValue = tickets.reduce((total, ticket) =>
    ticket.status === "ORDERED" ? total + (ticket.order_amount ?? 0) : total, 0);

  function requestMove(ticket: MyJobTicket, column: MyJobsColumn) {
    if (column.statuses.includes(ticket.status as never) && column.statuses.length === 1) return;
    setMove({ ticket, column });
  }

  function handleDrop(column: MyJobsColumn) {
    const ticket = tickets.find((candidate) => candidate.id === draggedTicketId);
    setDraggedTicketId(null);
    setDropColumnId(null);
    if (ticket) requestMove(ticket, column);
  }

  return (
    <AuthGuard requiredRole="admin">
      <ConsoleShell
        title="My Jobs"
        eyebrow={operatorLabel ? `Jobs assigned to ${operatorLabel}` : "Personal operator queue"}
        searchValue={searchQuery}
        searchPlaceholder="Search job, machine or requester"
        onSearchChange={setSearchQuery}
        actions={
          <button type="button" className="console-command-action" onClick={() => void loadTickets(false)} disabled={isLoading || isRefreshing}>
            <ConsoleIcon name="refresh" className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            <span>{isRefreshing ? "Syncing" : "Refresh"}</span>
          </button>
        }
      >
        <section className="my-jobs-header">
          <div className="my-jobs-identity"><span aria-hidden="true">⌾</span><strong>Personal view</strong><small>Assigned to you only</small></div>
          <div className="my-jobs-metrics" aria-label="My jobs summary">
            <div><strong>{tickets.length}</strong><span>{showCompleted ? "completed" : "active"}</span></div>
            <div className="my-jobs-metric-urgent"><strong>{urgentCount}</strong><span>urgent</span></div>
            <div className="my-jobs-metric-value"><strong>{formatConsoleCurrency(orderedValue)}</strong><span>ordered</span></div>
          </div>
          <label className="my-jobs-compact"><input type="checkbox" checked={compactCards} onChange={(event) => setCompactCards(event.target.checked)} /><span>Compact cards</span></label>
        </section>

        <section className="my-jobs-help">
          <span aria-hidden="true">i</span>
          <p>Drop a card into a status. RELAY will ask for any details needed to qualify the change.</p>
          <button type="button" onClick={() => setShowCompleted((current) => !current)}>{showCompleted ? "Back to active jobs" : "View completed"}</button>
        </section>

        {errorMessage ? <div className="console-error-state">{errorMessage}</div> : null}

        {showCompleted ? (
          <section className="my-jobs-completed-panel">
            <div><p>Completed work</p><h2>{visibleTickets.length} jobs completed by {operatorLabel || "you"}</h2></div>
            <div className="my-jobs-completed-grid">
              {visibleTickets.map((ticket) => <MyJobCard key={ticket.id} ticket={ticket} compact={compactCards} />)}
            </div>
          </section>
        ) : (
          <section className={`my-jobs-board ${compactCards ? "my-jobs-board-compact" : ""}`} aria-label="Assigned jobs by status">
            {MY_JOBS_COLUMNS.map((column) => {
              const columnTickets = getMyJobsColumnTickets(visibleTickets, column);
              const isDropTarget = dropColumnId === column.id;
              return (
                <div
                  key={column.id}
                  className={`my-jobs-column my-jobs-column-${column.tone} ${isDropTarget ? "my-jobs-column-drop" : ""}`}
                  onDragOver={(event) => { event.preventDefault(); setDropColumnId(column.id); }}
                  onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropColumnId(null); }}
                  onDrop={(event) => { event.preventDefault(); handleDrop(column); }}
                >
                  <header><h2>{column.label}</h2><span>{columnTickets.length}</span></header>
                  {isDropTarget ? <p className="my-jobs-drop-hint">Drop to move to {column.label}</p> : null}
                  <div className="my-jobs-card-stack">
                    {isLoading ? Array.from({ length: 2 }).map((_, index) => <div key={index} className="my-jobs-card-skeleton" />) : null}
                    {!isLoading && columnTickets.length === 0 ? <p className="my-jobs-empty-column">No assigned jobs</p> : null}
                    {columnTickets.map((ticket) => (
                      <MyJobCard
                        key={ticket.id}
                        ticket={ticket}
                        compact={compactCards}
                        draggable
                        dragging={draggedTicketId === ticket.id}
                        onDragStart={() => setDraggedTicketId(ticket.id)}
                        onDragEnd={() => { setDraggedTicketId(null); setDropColumnId(null); }}
                        onMove={(columnId) => {
                          const target = MY_JOBS_COLUMNS.find((candidate) => candidate.id === columnId);
                          if (target) requestMove(ticket, target);
                        }}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        )}

        <footer className="my-jobs-sync">{lastSyncedAt ? `Live · last synced ${lastSyncedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : "Connecting to RELAY"}</footer>
        <MyJobStatusModal
          move={move}
          operatorLabel={operatorLabel}
          onClose={() => setMove(null)}
          onSaved={(savedTicket) => {
            setTickets((current) => current.map((ticket) => ticket.id === savedTicket.id ? savedTicket : ticket));
          }}
        />
      </ConsoleShell>
    </AuthGuard>
  );
}

function MyJobCard({
  ticket,
  compact,
  draggable = false,
  dragging = false,
  onDragStart,
  onDragEnd,
  onMove,
}: {
  ticket: MyJobTicket;
  compact: boolean;
  draggable?: boolean;
  dragging?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onMove?: (columnId: string) => void;
}) {
  return (
    <article className={`my-job-card ${dragging ? "my-job-card-dragging" : ""}`} draggable={draggable} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="my-job-card-heading">
        <Link href={`/tickets/${ticket.id}`}>JOB {ticket.job_number || ticket.id.slice(0, 8)}</Link>
        {ticket.is_urgent ? <span>Urgent</span> : ticket.order_amount ? <small>{formatConsoleCurrency(ticket.order_amount)}</small> : null}
      </div>
      <h3>{ticket.request_summary?.trim() || ticket.request_details?.trim() || "Request details not recorded"}</h3>
      <dl>
        <div><dt>Machine</dt><dd>{ticket.machine_reference || ticket.machine_number || "Not recorded"}</dd></div>
        {!compact ? <div><dt>Requester</dt><dd>{ticket.requester_name || "Not recorded"}</dd></div> : null}
        <div><dt>Time</dt><dd>{formatTimeInStatus(ticket)}</dd></div>
        {ticket.status === "ORDERED" && ticket.expected_delivery_date ? <div><dt>Expected</dt><dd>{new Date(ticket.expected_delivery_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</dd></div> : null}
        {ticket.status === "READY" && ticket.bin_location ? <div><dt>Bin</dt><dd>{ticket.bin_location}</dd></div> : null}
      </dl>
      {onMove ? (
        <label className="my-job-card-move">
          <span>Move job</span>
          <select value="" onChange={(event) => { if (event.target.value) onMove(event.target.value); }}>
            <option value="">Move to…</option>
            {MY_JOBS_COLUMNS.filter((column) => !column.statuses.includes(ticket.status as never) || column.statuses.length > 1).map((column) => (
              <option key={column.id} value={column.id}>{column.label} ({getDefaultTargetStatus(column).replaceAll("_", " ")})</option>
            ))}
          </select>
        </label>
      ) : null}
    </article>
  );
}
