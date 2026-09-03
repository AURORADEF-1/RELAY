"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { ConsoleIcon } from "@/components/console/console-icon";
import { ConsoleShell } from "@/components/console/console-shell";
import { StatusBadge } from "@/components/status-badge";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import { sanitizeUserFacingError } from "@/lib/security";
import { getSupabaseClient } from "@/lib/supabase";

type CompletedTicket = {
  id: string;
  requester_name: string | null;
  machine_reference: string | null;
  job_number: string | null;
  request_summary: string | null;
  request_details: string | null;
  assigned_to: string | null;
  updated_at: string | null;
};

type DatePreset = "all" | "today" | "7-days" | "30-days" | "custom";

const PAGE_SIZE = 50;

export default function CompletedPage() {
  const router = useRouter();
  const [tickets, setTickets] = useState<CompletedTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [ticketPendingDelete, setTicketPendingDelete] =
    useState<CompletedTicket | null>(null);
  const [completedFromDate, setCompletedFromDate] = useState("");
  const [completedToDate, setCompletedToDate] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [notice, setNotice] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const loadTickets = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");

    const supabase = getSupabaseClient();

    if (!supabase) {
      setErrorMessage("Supabase environment variables are not configured.");
      setIsLoading(false);
      return;
    }

    const { user, isAdmin } = await getCurrentUserWithRole(supabase);

    if (!user) {
      router.replace("/login?next=/completed");
      return;
    }

    if (!isAdmin) {
      router.replace("/");
      return;
    }

    const { data, error } = await supabase
      .from("tickets")
      .select(
        "id, requester_name, machine_reference, job_number, request_summary, request_details, assigned_to, updated_at",
      )
      .eq("status", "COMPLETED")
      .order("updated_at", { ascending: false });

    if (error) {
      setErrorMessage(
        sanitizeUserFacingError(error, "Unable to load completed jobs."),
      );
      setTickets([]);
      setIsLoading(false);
      return;
    }

    setTickets((data ?? []) as CompletedTicket[]);
    setLastSyncedAt(new Date());
    setIsLoading(false);
  }, [router]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadTickets(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadTickets]);

  async function deleteTicket(ticket: CompletedTicket) {
    const supabase = getSupabaseClient();

    if (!supabase) {
      setNotice({
        type: "error",
        message: "Supabase environment variables are not configured.",
      });
      return;
    }

    setActiveTicketId(ticket.id);
    setNotice(null);
    setErrorMessage("");

    const { error } = await supabase
      .from("tickets")
      .delete()
      .eq("id", ticket.id);

    if (error) {
      setNotice({
        type: "error",
        message: sanitizeUserFacingError(
          error,
          "Unable to delete this completed job.",
        ),
      });
      setActiveTicketId(null);
      return;
    }

    setTickets((current) =>
      current.filter((currentTicket) => currentTicket.id !== ticket.id),
    );
    setTicketPendingDelete(null);
    setNotice({
      type: "success",
      message: `Completed job ${ticket.job_number ?? ticket.id} deleted.`,
    });
    setActiveTicketId(null);
  }

  async function handleReopenTicket(ticket: CompletedTicket) {
    const supabase = getSupabaseClient();

    if (!supabase) {
      setNotice({
        type: "error",
        message: "Supabase environment variables are not configured.",
      });
      return;
    }

    setActiveTicketId(ticket.id);
    setNotice(null);
    setErrorMessage("");

    const { error: updateError } = await supabase
      .from("tickets")
      .update({ status: "PENDING", updated_at: new Date().toISOString() })
      .eq("id", ticket.id);

    if (updateError) {
      setNotice({
        type: "error",
        message: sanitizeUserFacingError(
          updateError,
          "Unable to reopen this completed job.",
        ),
      });
      setActiveTicketId(null);
      return;
    }

    const { error: historyError } = await supabase
      .from("ticket_updates")
      .insert({
        ticket_id: ticket.id,
        status: "PENDING",
        comment: "Ticket reopened from completed archive.",
      });

    if (historyError) {
      setNotice({
        type: "error",
        message: sanitizeUserFacingError(
          historyError,
          "Unable to record the reopen event.",
        ),
      });
      setActiveTicketId(null);
      return;
    }

    setTickets((current) =>
      current.filter((currentTicket) => currentTicket.id !== ticket.id),
    );
    setNotice({
      type: "success",
      message: `Completed job ${ticket.job_number ?? ticket.id} reopened to PENDING.`,
    });
    setActiveTicketId(null);
  }

  const filteredTickets = useMemo(() => {
    const fromTime = completedFromDate
      ? new Date(`${completedFromDate}T00:00:00`).getTime()
      : null;
    const toTime = completedToDate
      ? new Date(`${completedToDate}T23:59:59.999`).getTime()
      : null;
    const query = searchQuery.trim().toLowerCase();

    return tickets.filter((ticket) => {
      const completedAt = ticket.updated_at
        ? new Date(ticket.updated_at).getTime()
        : Number.NaN;

      if (Number.isNaN(completedAt)) return false;
      if (fromTime != null && completedAt < fromTime) return false;
      if (toTime != null && completedAt > toTime) return false;
      if (!query) return true;

      return [
        ticket.job_number,
        ticket.requester_name,
        ticket.machine_reference,
        ticket.request_summary,
        ticket.request_details,
        ticket.assigned_to,
      ].some((value) => value?.toLowerCase().includes(query));
    });
  }, [completedFromDate, completedToDate, searchQuery, tickets]);

  const completedTodayCount = useMemo(() => {
    const today = toLocalDateValue(new Date());
    return tickets.filter(
      (ticket) =>
        ticket.updated_at &&
        toLocalDateValue(new Date(ticket.updated_at)) === today,
    ).length;
  }, [tickets]);

  const operatorCount = useMemo(
    () =>
      new Set(
        tickets.map((ticket) => ticket.assigned_to?.trim()).filter(Boolean),
      ).size,
    [tickets],
  );

  const pageCount = Math.max(1, Math.ceil(filteredTickets.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visibleTickets = filteredTickets.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );
  const firstVisible =
    filteredTickets.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const lastVisible = Math.min(safePage * PAGE_SIZE, filteredTickets.length);
  const hasActiveFilters = Boolean(
    searchQuery || completedFromDate || completedToDate,
  );

  function applyDatePreset(preset: Exclude<DatePreset, "custom">) {
    setDatePreset(preset);
    setPage(1);

    if (preset === "all") {
      setCompletedFromDate("");
      setCompletedToDate("");
      return;
    }

    const today = new Date();
    const fromDate = new Date(today);
    const dayOffset = preset === "today" ? 0 : preset === "7-days" ? 6 : 29;
    fromDate.setDate(today.getDate() - dayOffset);
    setCompletedFromDate(toLocalDateValue(fromDate));
    setCompletedToDate(toLocalDateValue(today));
  }

  function clearFilters() {
    setSearchQuery("");
    setCompletedFromDate("");
    setCompletedToDate("");
    setDatePreset("all");
    setPage(1);
  }

  function handleExportTickets() {
    if (filteredTickets.length === 0) {
      setNotice({
        type: "error",
        message: "There are no completed jobs matching the current filters.",
      });
      return;
    }

    const csvRows = [
      [
        "completed_at",
        "job_number",
        "submitter",
        "machine_reference",
        "request_summary",
        "handled_by",
      ],
      ...filteredTickets.map((ticket) => [
        ticket.updated_at ?? "",
        ticket.job_number ?? "",
        ticket.requester_name ?? "",
        ticket.machine_reference ?? "",
        ticket.request_summary ?? ticket.request_details ?? "",
        ticket.assigned_to ?? "",
      ]),
    ];
    const csvContent = csvRows
      .map((row) =>
        row
          .map((value) => `"${String(value).replaceAll('"', '""')}"`)
          .join(","),
      )
      .join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const downloadUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = `relay-completed-jobs-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(downloadUrl);
    setNotice({
      type: "success",
      message: `Exported ${filteredTickets.length} completed job${filteredTickets.length === 1 ? "" : "s"}.`,
    });
  }

  return (
    <AuthGuard requiredRole="admin">
      <ConsoleShell
        eyebrow="RELAY archive"
        title="Completed Jobs"
        contentClassName="console-content-completed"
        searchValue={searchQuery}
        searchPlaceholder="Search job, requester, machine or part"
        onSearchChange={(value) => {
          setSearchQuery(value);
          setPage(1);
        }}
        actions={
          <>
            <button
              type="button"
              className="console-command-action"
              onClick={handleExportTickets}
              disabled={isLoading || filteredTickets.length === 0}
            >
              <ConsoleIcon name="file" className="h-4 w-4" />
              <span>Export</span>
            </button>
            <button
              type="button"
              className="console-command-action"
              onClick={() => void loadTickets()}
              disabled={isLoading}
            >
              <ConsoleIcon
                name="refresh"
                className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
              />
              <span>{isLoading ? "Syncing" : "Refresh"}</span>
            </button>
          </>
        }
      >
        <section
          className="completed-overview-strip"
          aria-label="Completed jobs summary"
        >
          <CompletedMetric
            label="Archived jobs"
            value={String(tickets.length)}
            detail="Newest completed first"
          />
          <CompletedMetric
            label="Matching view"
            value={String(filteredTickets.length)}
            detail={
              hasActiveFilters
                ? "Filtered archive results"
                : "All loaded archive results"
            }
          />
          <CompletedMetric
            label="Completed today"
            value={String(completedTodayCount)}
            detail="Since midnight today"
            tone="success"
          />
          <CompletedMetric
            label="Handled by"
            value={String(operatorCount)}
            detail="Recorded archive operators"
          />
        </section>

        <section className="completed-workspace">
          <header className="completed-workspace-header">
            <div>
              <p className="console-section-label">Archive workspace</p>
              <h2>Find completed work quickly</h2>
              <p>
                {lastSyncedAt
                  ? `Last synced ${lastSyncedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
                  : "Connecting to the archive"}
              </p>
            </div>
            <div
              className="completed-preset-group"
              role="group"
              aria-label="Completed date range"
            >
              {(
                [
                  ["all", "All"],
                  ["today", "Today"],
                  ["7-days", "7 days"],
                  ["30-days", "30 days"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={
                    datePreset === value ? "completed-preset-active" : undefined
                  }
                  onClick={() => applyDatePreset(value)}
                  aria-pressed={datePreset === value}
                >
                  {label}
                </button>
              ))}
            </div>
          </header>

          <div className="completed-filter-bar">
            <label>
              <span>Completed from</span>
              <input
                type="date"
                value={completedFromDate}
                onChange={(event) => {
                  setCompletedFromDate(event.target.value);
                  setDatePreset("custom");
                  setPage(1);
                }}
              />
            </label>
            <label>
              <span>Completed to</span>
              <input
                type="date"
                value={completedToDate}
                onChange={(event) => {
                  setCompletedToDate(event.target.value);
                  setDatePreset("custom");
                  setPage(1);
                }}
              />
            </label>
            <div className="completed-filter-summary">
              <ConsoleIcon name="filter" className="h-4 w-4" />
              <span>
                {hasActiveFilters
                  ? `${filteredTickets.length} matching job${filteredTickets.length === 1 ? "" : "s"}`
                  : `${tickets.length} archived job${tickets.length === 1 ? "" : "s"}`}
              </span>
            </div>
            <button
              type="button"
              className="console-secondary-compact-action"
              onClick={clearFilters}
              disabled={!hasActiveFilters}
            >
              Clear filters
            </button>
          </div>

          {notice ? (
            <div
              className={`completed-notice completed-notice-${notice.type}`}
              role="status"
              aria-live="polite"
            >
              <span>{notice.type === "success" ? "✓" : "!"}</span>
              <p>{notice.message}</p>
              <button
                type="button"
                onClick={() => setNotice(null)}
                aria-label="Dismiss message"
              >
                <ConsoleIcon name="close" className="h-4 w-4" />
              </button>
            </div>
          ) : null}

          {errorMessage ? (
            <div className="console-error-state">{errorMessage}</div>
          ) : null}

          <div className="completed-table-wrap">
            <div className="hidden overflow-x-auto lg:block">
              <table className="completed-table">
                <thead>
                  <tr>
                    <th>Completed</th>
                    <th>Job</th>
                    <th>Requester / machine</th>
                    <th>Request</th>
                    <th>Owner</th>
                    <th>Status</th>
                    <th className="completed-actions-heading">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    Array.from({ length: 8 }).map((_, index) => (
                      <tr
                        key={index}
                        className="completed-table-skeleton"
                        aria-hidden="true"
                      >
                        <td colSpan={7}>
                          <span />
                        </td>
                      </tr>
                    ))
                  ) : visibleTickets.length === 0 ? (
                    <tr>
                      <td colSpan={7}>
                        <CompletedEmptyState
                          filtered={hasActiveFilters}
                          onClear={clearFilters}
                        />
                      </td>
                    </tr>
                  ) : (
                    visibleTickets.map((ticket) => (
                      <CompletedTableRow
                        key={ticket.id}
                        ticket={ticket}
                        busy={activeTicketId === ticket.id}
                        onReopen={() => void handleReopenTicket(ticket)}
                        onDelete={() => setTicketPendingDelete(ticket)}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="completed-mobile-list lg:hidden">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="completed-mobile-skeleton" />
                ))
              ) : visibleTickets.length === 0 ? (
                <CompletedEmptyState
                  filtered={hasActiveFilters}
                  onClear={clearFilters}
                />
              ) : (
                visibleTickets.map((ticket) => (
                  <CompletedMobileCard
                    key={ticket.id}
                    ticket={ticket}
                    busy={activeTicketId === ticket.id}
                    onReopen={() => void handleReopenTicket(ticket)}
                    onDelete={() => setTicketPendingDelete(ticket)}
                  />
                ))
              )}
            </div>
          </div>

          {!isLoading && filteredTickets.length > 0 ? (
            <footer className="completed-pagination">
              <p>
                Showing {firstVisible}–{lastVisible} of {filteredTickets.length}
              </p>
              <div>
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={safePage === 1}
                >
                  Previous
                </button>
                <span>
                  Page {safePage} of {pageCount}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setPage((current) => Math.min(pageCount, current + 1))
                  }
                  disabled={safePage === pageCount}
                >
                  Next
                </button>
              </div>
            </footer>
          ) : null}
        </section>

        {ticketPendingDelete ? (
          <DeleteConfirmation
            ticket={ticketPendingDelete}
            busy={activeTicketId === ticketPendingDelete.id}
            onCancel={() => setTicketPendingDelete(null)}
            onConfirm={() => void deleteTicket(ticketPendingDelete)}
          />
        ) : null}
      </ConsoleShell>
    </AuthGuard>
  );
}

function CompletedMetric({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "success";
}) {
  return (
    <div className={`completed-metric completed-metric-${tone}`}>
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{detail}</span>
    </div>
  );
}

function CompletedTableRow({
  ticket,
  busy,
  onReopen,
  onDelete,
}: {
  ticket: CompletedTicket;
  busy: boolean;
  onReopen: () => void;
  onDelete: () => void;
}) {
  return (
    <tr>
      <td className="completed-date-cell">{formatDate(ticket.updated_at)}</td>
      <td>
        <Link href={`/tickets/${ticket.id}`} className="completed-job-link">
          <span>{ticket.job_number ?? "No job number"}</span>
          <small>Open ticket</small>
        </Link>
      </td>
      <td>
        <strong className="completed-primary-text">
          {ticket.requester_name ?? "Unknown requester"}
        </strong>
        <span className="completed-secondary-text">
          {ticket.machine_reference ?? "No machine recorded"}
        </span>
      </td>
      <td>
        <p className="completed-request-copy">
          {ticket.request_summary ??
            ticket.request_details ??
            "No request summary"}
        </p>
      </td>
      <td>
        <span className="completed-owner">
          {ticket.assigned_to ?? "Unassigned"}
        </span>
      </td>
      <td>
        <StatusBadge status="COMPLETED" />
      </td>
      <td>
        <div className="completed-row-actions">
          <Link
            href={`/tickets/${ticket.id}`}
            aria-label={`Open job ${ticket.job_number ?? ticket.id}`}
          >
            Open
          </Link>
          <button type="button" onClick={onReopen} disabled={busy}>
            {busy ? "Working" : "Re-open"}
          </button>
          <button
            type="button"
            className="completed-delete-action"
            onClick={onDelete}
            disabled={busy}
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}

function CompletedMobileCard({
  ticket,
  busy,
  onReopen,
  onDelete,
}: {
  ticket: CompletedTicket;
  busy: boolean;
  onReopen: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="completed-mobile-card">
      <div className="completed-mobile-card-heading">
        <div>
          <p>Job</p>
          <Link href={`/tickets/${ticket.id}`}>
            {ticket.job_number ?? "No job number"}
          </Link>
        </div>
        <StatusBadge status="COMPLETED" />
      </div>
      <p className="completed-mobile-request">
        {ticket.request_summary ??
          ticket.request_details ??
          "No request summary"}
      </p>
      <dl>
        <div>
          <dt>Requester</dt>
          <dd>{ticket.requester_name ?? "Unknown"}</dd>
        </div>
        <div>
          <dt>Machine</dt>
          <dd>{ticket.machine_reference ?? "Not recorded"}</dd>
        </div>
        <div>
          <dt>Owner</dt>
          <dd>{ticket.assigned_to ?? "Unassigned"}</dd>
        </div>
        <div>
          <dt>Completed</dt>
          <dd>{formatDate(ticket.updated_at)}</dd>
        </div>
      </dl>
      <div className="completed-mobile-actions">
        <Link href={`/tickets/${ticket.id}`}>Open ticket</Link>
        <button type="button" onClick={onReopen} disabled={busy}>
          {busy ? "Working" : "Re-open"}
        </button>
        <button
          type="button"
          className="completed-delete-action"
          onClick={onDelete}
          disabled={busy}
        >
          Delete
        </button>
      </div>
    </article>
  );
}

function CompletedEmptyState({
  filtered,
  onClear,
}: {
  filtered: boolean;
  onClear: () => void;
}) {
  return (
    <div className="completed-empty-state">
      <ConsoleIcon
        name={filtered ? "search" : "clipboard"}
        className="h-5 w-5"
      />
      <div>
        <h3>
          {filtered ? "No matching completed jobs" : "No completed jobs yet"}
        </h3>
        <p>
          {filtered
            ? "Try a different job number, name, machine or date range."
            : "Completed work will appear here automatically."}
        </p>
      </div>
      {filtered ? (
        <button type="button" onClick={onClear}>
          Clear filters
        </button>
      ) : null}
    </div>
  );
}

function DeleteConfirmation({
  ticket,
  busy,
  onCancel,
  onConfirm,
}: {
  ticket: CompletedTicket;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="completed-dialog-scrim"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <section
        className="completed-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="completed-delete-title"
        aria-describedby="completed-delete-description"
      >
        <div className="completed-dialog-icon" aria-hidden="true">
          !
        </div>
        <p className="console-section-label">Permanent action</p>
        <h2 id="completed-delete-title">Delete completed job?</h2>
        <p id="completed-delete-description">
          Job <strong>{ticket.job_number ?? ticket.id}</strong> and its linked
          record will be permanently deleted. This cannot be undone.
        </p>
        <div className="completed-dialog-actions">
          <button type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="completed-dialog-delete"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Deleting…" : "Delete permanently"}
          </button>
        </div>
      </section>
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) return "No date";
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toLocalDateValue(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
