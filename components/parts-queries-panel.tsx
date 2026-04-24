"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { StatusBadge } from "@/components/status-badge";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import {
  buildEmptyPartsQueryDraft,
  buildPartsQueryDraft,
  buildPartsQueriesCsvContent,
  closePartsQuery,
  createPartsQuery,
  fetchPartsQueries,
  formatPartsQueryCloseReason,
  partsQueryCloseReasons,
  reopenPartsQuery,
  type PartsQueryDraft,
  type PartsQueryCloseReason,
  type PartsQueryJobStatus,
  type PartsQueryRecord,
  updatePartsQuery,
} from "@/lib/parts-queries";
import { formatOrderAmount, parseOrderAmountInput } from "@/lib/ticket-operational";
import { getSupabaseClient } from "@/lib/supabase";

type PartsQueryFilter = "all" | "open" | "closed";

const partsQueryFilters: Array<{ key: PartsQueryFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "closed", label: "Closed" },
];
const PARTS_QUERIES_MIGRATION_HINT = "Apply docs/parts-queries-schema.sql and try again.";

const blankDraft = buildEmptyPartsQueryDraft();

type CloseDialogState = {
  queryId: string;
  closeReason: PartsQueryCloseReason | "";
  jobNumber: string;
};

export function PartsQueriesPanel() {
  const [queries, setQueries] = useState<PartsQueryRecord[]>([]);
  const [draftsById, setDraftsById] = useState<Record<string, PartsQueryDraft>>({});
  const [newQueryDraft, setNewQueryDraft] = useState<PartsQueryDraft>(blankDraft);
  const [activeFilter, setActiveFilter] = useState<PartsQueryFilter>("all");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [savingQueryId, setSavingQueryId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [closeDialog, setCloseDialog] = useState<CloseDialogState | null>(null);
  const [closingQueryId, setClosingQueryId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const loadPartsQueries = useCallback(async () => {
    const supabase = getSupabaseClient();

    if (!supabase) {
      setErrorMessage("Supabase environment variables are not configured.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage("");

    try {
      const { user, isAdmin } = await getCurrentUserWithRole(supabase, {
        forceFresh: true,
      });

      if (!user || !isAdmin) {
        setQueries([]);
        setDraftsById({});
        setCurrentUserId(null);
        setErrorMessage("Admin access is required for parts queries.");
        return;
      }

      setCurrentUserId(user.id);

      const records = await fetchPartsQueries(supabase, { jobStatus: "ALL" });
      setQueries(records);
      setDraftsById(
        records.reduce<Record<string, PartsQueryDraft>>((accumulator, record) => {
          accumulator[record.id] = buildPartsQueryDraft(record);
          return accumulator;
        }, {}),
      );
      setNotice(null);
    } catch (error) {
      setQueries([]);
      setDraftsById({});
      setErrorMessage(formatPartsQueriesError(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPartsQueries();
  }, [loadPartsQueries]);

  const visibleQueries = useMemo(() => {
    return queries
      .filter((query) => {
        if (activeFilter === "open") {
          return query.job_status === "OPEN";
        }

        if (activeFilter === "closed") {
          return query.job_status === "CLOSED";
        }

        return true;
      })
      .sort((left, right) => {
        if (left.job_status !== right.job_status) {
          return left.job_status === "OPEN" ? -1 : 1;
        }

        return toTimestamp(right.updated_at) - toTimestamp(left.updated_at);
      });
  }, [activeFilter, queries]);

  const metrics = useMemo(() => {
    const openQueries = queries.filter((query) => query.job_status === "OPEN");
    const closedQueries = queries.filter((query) => query.job_status === "CLOSED");
    const missingJobNumber = queries.filter((query) => !query.job_number?.trim());
    const orderedForJob = queries.filter((query) => query.ordered_for_job);
    const totalValue = queries.reduce(
      (sum, query) => sum + (typeof query.part_price === "number" ? query.part_price : 0),
      0,
    );

    return {
      openQueries: openQueries.length,
      closedQueries: closedQueries.length,
      missingJobNumber: missingJobNumber.length,
      orderedForJob: orderedForJob.length,
      totalValue,
    };
  }, [queries]);

  const updateDraft = useCallback(
    (queryId: string, patch: Partial<PartsQueryDraft>) => {
      setDraftsById((current) => ({
        ...current,
        [queryId]: {
          ...(current[queryId] ?? blankDraft),
          ...patch,
        },
      }));
    },
    [],
  );

  const handleCreateQuery = useCallback(async () => {
    const supabase = getSupabaseClient();

    if (!supabase || !currentUserId) {
      setNotice({
        type: "error",
        message: "Unable to save the query right now.",
      });
      return;
    }

    const partDescription = newQueryDraft.part_description.trim();

    if (!partDescription) {
      setNotice({
        type: "error",
        message: "Add a part description before saving.",
      });
      return;
    }

    const parsedPartPrice = parseOrderAmountInput(newQueryDraft.part_price);

    if (Number.isNaN(parsedPartPrice)) {
      setNotice({
        type: "error",
        message: "Enter a valid part price or leave it blank.",
      });
      return;
    }

    setIsCreating(true);
    setNotice(null);

    try {
      const created = await createPartsQuery(supabase, {
        createdBy: currentUserId,
        updatedBy: currentUserId,
        partDescription,
        jobNumber: newQueryDraft.job_number,
        partPrice: parsedPartPrice ?? null,
        orderedForJob: newQueryDraft.ordered_for_job,
        fitter: newQueryDraft.fitter,
        workshopResponse: newQueryDraft.workshop_response,
        jobStatus: newQueryDraft.job_status,
        notes: newQueryDraft.notes,
      });

      setQueries((current) => [created, ...current]);
      setDraftsById((current) => ({
        ...current,
        [created.id]: buildPartsQueryDraft(created),
      }));
      setNewQueryDraft(blankDraft);
      setNotice({
        type: "success",
        message: "Parts query logged.",
      });
    } catch (error) {
      setNotice({
        type: "error",
        message: formatPartsQueriesError(error, "Unable to log the parts query."),
      });
    } finally {
      setIsCreating(false);
    }
  }, [currentUserId, newQueryDraft]);

  const handleSaveQuery = useCallback(
    async (queryId: string) => {
      const supabase = getSupabaseClient();

      if (!supabase || !currentUserId) {
        setNotice({
          type: "error",
          message: "Unable to update the query right now.",
        });
        return;
      }

      const draft = draftsById[queryId];

      if (!draft) {
        setNotice({
          type: "error",
          message: "That parts query could not be found.",
        });
        return;
      }

      const partDescription = draft.part_description.trim();

      if (!partDescription) {
        setNotice({
          type: "error",
          message: "Part description is required.",
        });
        return;
      }

      const parsedPartPrice = parseOrderAmountInput(draft.part_price);

      if (Number.isNaN(parsedPartPrice)) {
        setNotice({
          type: "error",
          message: "Enter a valid part price or leave it blank.",
        });
        return;
      }

      setSavingQueryId(queryId);
      setNotice(null);

      try {
        const updated = await updatePartsQuery(supabase, queryId, {
          updatedBy: currentUserId,
          partDescription,
          jobNumber: draft.job_number,
          partPrice: parsedPartPrice ?? null,
          orderedForJob: draft.ordered_for_job,
          fitter: draft.fitter,
          workshopResponse: draft.workshop_response,
          jobStatus: draft.job_status,
          notes: draft.notes,
        });

        setQueries((current) =>
          current.map((record) => (record.id === updated.id ? updated : record)),
        );
        setDraftsById((current) => ({
          ...current,
          [updated.id]: buildPartsQueryDraft(updated),
        }));
        setNotice({
          type: "success",
          message: "Parts query updated.",
        });
      } catch (error) {
        setNotice({
          type: "error",
          message: formatPartsQueriesError(error, "Unable to update the parts query."),
        });
      } finally {
        setSavingQueryId(null);
      }
    },
    [currentUserId, draftsById],
  );

  const handleExportCsv = useCallback(() => {
    setIsExporting(true);

    try {
      const csvContent = buildPartsQueriesCsvContent(visibleQueries);
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `parts-queries-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  }, [visibleQueries]);

  const openCloseDialog = useCallback((query: PartsQueryRecord) => {
    setNotice(null);
    setCloseDialog({
      queryId: query.id,
      closeReason: "",
      jobNumber: query.job_number ?? "",
    });
  }, []);

  const handleCloseQuery = useCallback(async () => {
    const supabase = getSupabaseClient();

    if (!supabase || !currentUserId || !closeDialog) {
      setNotice({
        type: "error",
        message: "Unable to close the query right now.",
      });
      return;
    }

    if (!closeDialog.closeReason) {
      setNotice({
        type: "error",
        message: "Choose how the query was resolved.",
      });
      return;
    }

    setClosingQueryId(closeDialog.queryId);
    setNotice(null);

    try {
      const updated = await closePartsQuery(supabase, closeDialog.queryId, {
        updatedBy: currentUserId,
        closeReason: closeDialog.closeReason,
        jobNumber: closeDialog.jobNumber,
      });

      setQueries((current) =>
        current.map((record) => (record.id === updated.id ? updated : record)),
      );
      setDraftsById((current) => ({
        ...current,
        [updated.id]: buildPartsQueryDraft(updated),
      }));
      setCloseDialog(null);
      setNotice({
        type: "success",
        message: "Parts query closed.",
      });
    } catch (error) {
      setNotice({
        type: "error",
        message: formatPartsQueriesError(error, "Unable to close the parts query."),
      });
    } finally {
      setClosingQueryId(null);
    }
  }, [closeDialog, currentUserId]);

  const handleReopenQuery = useCallback(
    async (queryId: string) => {
      const supabase = getSupabaseClient();

      if (!supabase || !currentUserId) {
        setNotice({
          type: "error",
          message: "Unable to reopen the query right now.",
        });
        return;
      }

      setSavingQueryId(queryId);
      setNotice(null);

      try {
        const updated = await reopenPartsQuery(supabase, queryId, {
          updatedBy: currentUserId,
        });

        setQueries((current) =>
          current.map((record) => (record.id === updated.id ? updated : record)),
        );
        setDraftsById((current) => ({
          ...current,
          [updated.id]: buildPartsQueryDraft(updated),
        }));
        setNotice({
          type: "success",
          message: "Parts query reopened.",
        });
      } catch (error) {
        setNotice({
          type: "error",
          message: formatPartsQueriesError(error, "Unable to reopen the parts query."),
        });
      } finally {
        setSavingQueryId(null);
      }
    },
    [currentUserId],
  );

  return (
    <section className="aurora-section mt-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="aurora-kicker">Parts Queries</div>
          <h2 className="mt-4 aurora-heading">Left Off Parts Log</h2>
          <p className="mt-3 max-w-3xl aurora-copy">
            Log parts that were taken off a job, left unfitted, or need follow-up even when there is
            no job number. Track price, fitter, workshop response, and whether the job is still open.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={isExporting || visibleQueries.length === 0}
            className="aurora-button-secondary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isExporting ? "Exporting..." : "Export CSV"}
          </button>
          <button
            type="button"
            onClick={() => void loadPartsQueries()}
            disabled={isLoading}
            className="aurora-button-secondary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? "Refreshing..." : "Refresh Queries"}
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Open" value={String(metrics.openQueries)} helper="Active follow-ups still waiting." />
        <MetricCard
          label="Closed"
          value={String(metrics.closedQueries)}
          helper="Resolved or no longer needed."
        />
        <MetricCard
          label="No Job Number"
          value={String(metrics.missingJobNumber)}
          helper="Logged without a ticket reference."
        />
        <MetricCard
          label="Ordered for Job"
          value={String(metrics.orderedForJob)}
          helper="Marked as ordered against a job."
        />
        <MetricCard
          label="Total Value"
          value={formatOrderAmount(metrics.totalValue)}
          helper="Combined logged part value."
        />
      </div>

      {errorMessage ? (
        <div className="aurora-alert aurora-alert-error mt-6">{errorMessage}</div>
      ) : null}

      {notice ? (
        <div
          className={`mt-6 ${
            notice.type === "success"
              ? "aurora-alert aurora-alert-success"
              : "aurora-alert aurora-alert-error"
          }`}
        >
          {notice.message}
        </div>
      ) : null}

      <div className="mt-6 aurora-subpanel p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="aurora-stat-label">New Parts Query</p>
            <p className="mt-2 text-sm text-[color:var(--foreground-muted)]">
              Capture a part that has fallen out of the normal ticket flow before it gets forgotten.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--foreground-subtle)]">
              Part Description
            </span>
            <input
              type="text"
              value={newQueryDraft.part_description}
              onChange={(event) =>
                setNewQueryDraft((current) => ({ ...current, part_description: event.target.value }))
              }
              placeholder="Brake pads left on job"
              className="aurora-input"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--foreground-subtle)]">
              Job Number
            </span>
            <input
              type="text"
              value={newQueryDraft.job_number}
              onChange={(event) =>
                setNewQueryDraft((current) => ({ ...current, job_number: event.target.value }))
              }
              placeholder="Optional"
              className="aurora-input"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--foreground-subtle)]">
              Part Price
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={newQueryDraft.part_price}
              onChange={(event) =>
                setNewQueryDraft((current) => ({ ...current, part_price: event.target.value }))
              }
              placeholder="0.00"
              className="aurora-input"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--foreground-subtle)]">
              Fitter
            </span>
            <input
              type="text"
              value={newQueryDraft.fitter}
              onChange={(event) =>
                setNewQueryDraft((current) => ({ ...current, fitter: event.target.value }))
              }
              placeholder="Optional"
              className="aurora-input"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--foreground-subtle)]">
              Job Status
            </span>
            <select
              value={newQueryDraft.job_status}
              onChange={(event) =>
                setNewQueryDraft((current) => ({
                  ...current,
                  job_status: event.target.value as PartsQueryJobStatus,
                }))
              }
              className="aurora-select"
            >
              <option value="OPEN">Open</option>
              <option value="CLOSED">Closed</option>
            </select>
          </label>

          <label className="flex items-center gap-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--background-panel-strong)] px-4 py-4">
            <input
              type="checkbox"
              checked={newQueryDraft.ordered_for_job}
              onChange={(event) =>
                setNewQueryDraft((current) => ({ ...current, ordered_for_job: event.target.checked }))
              }
              className="h-4 w-4 rounded border-[color:var(--border)] text-[color:var(--accent)] focus:ring-[color:var(--accent)]"
            />
            <span className="text-sm text-[color:var(--foreground-muted)]">Ordered for job</span>
          </label>

          <label className="grid gap-2 lg:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--foreground-subtle)]">
              Workshop Response
            </span>
            <textarea
              value={newQueryDraft.workshop_response}
              onChange={(event) =>
                setNewQueryDraft((current) => ({
                  ...current,
                  workshop_response: event.target.value,
                }))
              }
              placeholder="Waiting on workshop, no response, part left unfitted..."
              className="aurora-textarea"
            />
          </label>

          <label className="grid gap-2 lg:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--foreground-subtle)]">
              Notes
            </span>
            <textarea
              value={newQueryDraft.notes}
              onChange={(event) =>
                setNewQueryDraft((current) => ({ ...current, notes: event.target.value }))
              }
              placeholder="Anything else the admin team needs to remember."
              className="aurora-textarea"
            />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => setNewQueryDraft(blankDraft)}
            className="aurora-button-secondary"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={() => void handleCreateQuery()}
            disabled={isCreating}
            className="aurora-button disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isCreating ? "Saving..." : "Log Query"}
          </button>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {partsQueryFilters.map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => setActiveFilter(filter.key)}
              className={`aurora-pill border ${
                activeFilter === filter.key ? "aurora-pill-active" : ""
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--foreground-subtle)]">
          {visibleQueries.length} result{visibleQueries.length === 1 ? "" : "s"}
        </p>
      </div>

      <div className="mt-4 space-y-4">
        {isLoading ? (
          <div className="aurora-empty">Loading parts queries...</div>
        ) : visibleQueries.length === 0 ? (
          <div className="aurora-empty">No parts queries found for this filter.</div>
        ) : (
          visibleQueries.map((query) => {
            const draft = draftsById[query.id] ?? buildPartsQueryDraft(query);
            const isSaving = savingQueryId === query.id;

            return (
              <article
                key={query.id}
                className="rounded-[1.5rem] border border-[color:var(--border)] bg-[color:var(--background-panel-strong)] p-5 shadow-[var(--shadow-soft)]"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <StatusBadge status={query.job_status} />
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--foreground-subtle)]">
                        Updated {formatPartsQueryDateTime(query.updated_at)}
                      </p>
                    </div>
                    <p className="text-lg font-semibold text-[color:var(--foreground-strong)]">
                      {query.part_description}
                    </p>
                    <p className="text-sm text-[color:var(--foreground-muted)]">
                      {query.job_number?.trim() ? `Job ${query.job_number.trim()}` : "No job number"}{" "}
                      · {query.ordered_for_job ? "Ordered for job" : "Not marked as ordered"}
                      {typeof query.part_price === "number" ? ` · ${formatOrderAmount(query.part_price)}` : ""}
                    </p>
                    {query.job_status === "CLOSED" ? (
                      <p className="text-sm text-[color:var(--foreground-muted)]">
                        Closed as {formatPartsQueryCloseReason(query.close_reason)}
                        {query.closed_job_number?.trim()
                          ? ` · Job ${query.closed_job_number.trim()}`
                          : ""}
                        {query.closed_at ? ` · ${formatPartsQueryDateTime(query.closed_at)}` : ""}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        query.job_status === "OPEN"
                          ? openCloseDialog(query)
                          : void handleReopenQuery(query.id)
                      }
                      className="aurora-button-secondary"
                    >
                      {query.job_status === "OPEN" ? "Close Query" : "Reopen"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSaveQuery(query.id)}
                      disabled={isSaving}
                      className="aurora-button disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSaving ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  <label className="grid gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--foreground-subtle)]">
                      Part Description
                    </span>
                    <input
                      type="text"
                      value={draft.part_description}
                      onChange={(event) =>
                        updateDraft(query.id, { part_description: event.target.value })
                      }
                      className="aurora-input"
                    />
                  </label>

                  <label className="grid gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--foreground-subtle)]">
                      Job Number
                    </span>
                    <input
                      type="text"
                      value={draft.job_number}
                      onChange={(event) => updateDraft(query.id, { job_number: event.target.value })}
                      className="aurora-input"
                    />
                  </label>

                  <label className="grid gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--foreground-subtle)]">
                      Part Price
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={draft.part_price}
                      onChange={(event) => updateDraft(query.id, { part_price: event.target.value })}
                      className="aurora-input"
                    />
                  </label>

                  <label className="grid gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--foreground-subtle)]">
                      Fitter
                    </span>
                    <input
                      type="text"
                      value={draft.fitter}
                      onChange={(event) => updateDraft(query.id, { fitter: event.target.value })}
                      className="aurora-input"
                    />
                  </label>

                  <label className="grid gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--foreground-subtle)]">
                      Job Status
                    </span>
                    <select
                      value={draft.job_status}
                      onChange={(event) =>
                        updateDraft(query.id, {
                          job_status: event.target.value as PartsQueryJobStatus,
                        })
                      }
                      className="aurora-select"
                    >
                      <option value="OPEN">Open</option>
                      <option value="CLOSED">Closed</option>
                    </select>
                  </label>

                  <label className="flex items-center gap-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--background-muted)] px-4 py-4">
                    <input
                      type="checkbox"
                      checked={draft.ordered_for_job}
                      onChange={(event) =>
                        updateDraft(query.id, { ordered_for_job: event.target.checked })
                      }
                      className="h-4 w-4 rounded border-[color:var(--border)] text-[color:var(--accent)] focus:ring-[color:var(--accent)]"
                    />
                    <span className="text-sm text-[color:var(--foreground-muted)]">
                      Ordered for job
                    </span>
                  </label>

                  <label className="grid gap-2 lg:col-span-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--foreground-subtle)]">
                      Workshop Response
                    </span>
                    <textarea
                      value={draft.workshop_response}
                      onChange={(event) =>
                        updateDraft(query.id, { workshop_response: event.target.value })
                      }
                      className="aurora-textarea"
                    />
                  </label>

                  <label className="grid gap-2 lg:col-span-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--foreground-subtle)]">
                      Notes
                    </span>
                    <textarea
                      value={draft.notes}
                      onChange={(event) => updateDraft(query.id, { notes: event.target.value })}
                      className="aurora-textarea"
                    />
                  </label>
                </div>
              </article>
            );
          })
        )}
      </div>

      {closeDialog ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6 backdrop-blur-sm"
          role="presentation"
          onClick={() => setCloseDialog(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="parts-query-close-title"
            className="w-full max-w-xl rounded-[1.75rem] border border-[color:var(--border)] bg-[color:var(--background-panel-strong)] p-6 shadow-[0_28px_100px_-50px_rgba(15,23,42,0.9)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="aurora-kicker">Close Query</p>
                <h3 id="parts-query-close-title" className="mt-4 text-2xl font-semibold text-[color:var(--foreground-strong)]">
                  How was this part resolved?
                </h3>
                <p className="mt-3 text-sm leading-6 text-[color:var(--foreground-muted)]">
                  Choose the final outcome. If it was fitted to a job, enter the job number that received it.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCloseDialog(null)}
                className="aurora-button-secondary h-10 w-10 rounded-full p-0"
                aria-label="Close dialog"
              >
                ×
              </button>
            </div>

            <div className="mt-6 space-y-3">
              {partsQueryCloseReasons.map((reason) => {
                const isSelected = closeDialog.closeReason === reason;

                return (
                  <button
                    key={reason}
                    type="button"
                    onClick={() =>
                      setCloseDialog((current) =>
                        current
                          ? {
                              ...current,
                              closeReason: reason,
                              jobNumber:
                                reason === "FITTED_TO_JOB"
                                  ? current.jobNumber
                                  : current.jobNumber,
                            }
                          : current,
                      )
                    }
                    className={`flex w-full items-center justify-between rounded-2xl border px-4 py-4 text-left transition ${
                      isSelected
                        ? "border-[color:var(--accent)] bg-[color:var(--background-muted)]"
                        : "border-[color:var(--border)] bg-[color:var(--background-panel)] hover:bg-[color:var(--background-muted)]"
                    }`}
                  >
                    <span className="text-sm font-semibold text-[color:var(--foreground-strong)]">
                      {formatPartsQueryCloseReason(reason)}
                    </span>
                    <span className="text-xs uppercase tracking-[0.16em] text-[color:var(--foreground-subtle)]">
                      Select
                    </span>
                  </button>
                );
              })}
            </div>

            {closeDialog.closeReason === "FITTED_TO_JOB" ? (
              <label className="mt-5 grid gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--foreground-subtle)]">
                  Job Number
                </span>
                <input
                  type="text"
                  value={closeDialog.jobNumber}
                  onChange={(event) =>
                    setCloseDialog((current) =>
                      current ? { ...current, jobNumber: event.target.value } : current,
                    )
                  }
                  placeholder="Enter the fitted job number"
                  className="aurora-input"
                />
              </label>
            ) : null}

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setCloseDialog(null)}
                className="aurora-button-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleCloseQuery()}
                disabled={closingQueryId === closeDialog.queryId}
                className="aurora-button disabled:cursor-not-allowed disabled:opacity-60"
              >
                {closingQueryId === closeDialog.queryId ? "Closing..." : "Close Query"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function MetricCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <article className="aurora-stat-card">
      <p className="aurora-stat-label">{label}</p>
      <p className="aurora-stat-value">{value}</p>
      <p className="mt-3 text-sm leading-6 text-[color:var(--foreground-muted)]">{helper}</p>
    </article>
  );
}

function formatPartsQueryDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function toTimestamp(value: string) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function formatPartsQueriesError(error: unknown, fallback = "Unable to load parts queries.") {
  const message = error instanceof Error ? error.message : fallback;

  if (
    message.toLowerCase().includes("parts_queries") &&
    (message.toLowerCase().includes("does not exist") || message.toLowerCase().includes("relation"))
  ) {
    return `${message} ${PARTS_QUERIES_MIGRATION_HINT}`;
  }

  return message;
}
