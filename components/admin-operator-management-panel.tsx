"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import {
  addAdminOperator,
  deleteAdminOperator,
  fetchAdminOperatorRecords,
  getDefaultAdminOperatorOptions,
  isCoreAdminOperatorName,
  normalizeAdminOperatorName,
  type AdminOperatorRecord,
} from "@/lib/admin-operators";
import { getSupabaseClient } from "@/lib/supabase";

export function AdminOperatorManagementPanel() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [operators, setOperators] = useState<AdminOperatorRecord[]>([]);
  const [operatorName, setOperatorName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [deletingOperatorName, setDeletingOperatorName] = useState<string | null>(null);

  const defaultOperatorNames = useMemo(() => getDefaultAdminOperatorOptions(), []);

  const loadOperators = useCallback(async () => {
    const supabase = getSupabaseClient();

    if (!supabase) {
      setNotice({
        type: "error",
        message: "Supabase environment variables are not configured.",
      });
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const { user, isAdmin } = await getCurrentUserWithRole(supabase);

      if (!user || !isAdmin) {
        setNotice({
          type: "error",
          message: "Admin access is required to manage operator names.",
        });
        setIsLoading(false);
        return;
      }

      setCurrentUserId(user.id);
      const nextOperators = await fetchAdminOperatorRecords(supabase);
      setOperators(nextOperators);
      setNotice(null);
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to load operator names.",
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOperators();
  }, [loadOperators]);

  async function handleAddOperator() {
    const supabase = getSupabaseClient();
    const nextName = normalizeAdminOperatorName(operatorName);

    if (!supabase || !currentUserId) {
      setNotice({
        type: "error",
        message: "Unable to save operator names right now.",
      });
      return;
    }

    if (!nextName) {
      setNotice({
        type: "error",
        message: "Enter an operator name before adding it.",
      });
      return;
    }

    setIsSaving(true);
    setNotice(null);

    try {
      const nextSortOrder = operators.reduce((maxSortOrder, operator) => {
        return Math.max(maxSortOrder, operator.sort_order);
      }, 0) + 1;

      await addAdminOperator(supabase, {
        name: nextName,
        sortOrder: nextSortOrder,
      });

      setOperatorName("");
      await loadOperators();
      setNotice({
        type: "success",
        message: `${nextName} added to operator reporting.`,
      });
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to add the operator name.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteOperator(name: string) {
    const supabase = getSupabaseClient();

    if (!supabase || !currentUserId) {
      setNotice({
        type: "error",
        message: "Unable to delete operator names right now.",
      });
      return;
    }

    if (!window.confirm(`Delete ${name} from admin operator reporting?`)) {
      return;
    }

    setDeletingOperatorName(name);
    setNotice(null);

    try {
      await deleteAdminOperator(supabase, name);
      await loadOperators();
      setNotice({
        type: "success",
        message: `${name} removed from operator reporting.`,
      });
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to delete the operator name.",
      });
    } finally {
      setDeletingOperatorName(null);
    }
  }

  return (
    <section className="aurora-section admin-control-panel admin-control-operators">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="aurora-kicker">Admin Ops</div>
          <h2 className="mt-4 aurora-heading">Operator Names</h2>
          <p className="mt-3 max-w-3xl aurora-copy">
            Manage the operator names that appear on the TV wallboard, KPI views, and reporting.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadOperators()}
          disabled={isLoading}
          className="aurora-button-secondary disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? "Refreshing..." : "Refresh Operators"}
        </button>
      </div>

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

      <div className="mt-6 grid gap-4 xl:grid-cols-[1fr_0.95fr]">
        <div className="admin-control-form-card rounded-[1.5rem] border border-[color:var(--border)] bg-[color:var(--background-panel-strong)] p-5 shadow-[var(--shadow-soft)]">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[color:var(--foreground-subtle)]">
            Add operator
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              value={operatorName}
              onChange={(event) => setOperatorName(event.target.value)}
              placeholder="Enter operator name"
              className="aurora-input flex-1"
            />
            <button
              type="button"
              onClick={() => void handleAddOperator()}
              disabled={isLoading || isSaving}
              className="aurora-button-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? "Saving..." : "Add Operator"}
            </button>
          </div>
          <p className="mt-3 text-sm leading-6 text-[color:var(--foreground-muted)]">
            Add names here once and the wallboard will pick them up automatically.
          </p>
        </div>

        <div className="admin-control-form-card rounded-[1.5rem] border border-[color:var(--border)] bg-[color:var(--background-panel-strong)] p-5 shadow-[var(--shadow-soft)]">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[color:var(--foreground-subtle)]">
            Current list
          </p>
          <div className="mt-4 space-y-3">
            {isLoading ? (
              <div className="aurora-empty">Loading operator names...</div>
            ) : operators.length === 0 ? (
              <div className="aurora-empty">
                No saved operator names yet. Suggested defaults: {defaultOperatorNames.join(", ")}.
              </div>
            ) : (
              operators.map((operator) => (
                <div
                  key={operator.name}
                  className="admin-control-list-row flex items-center justify-between gap-3 rounded-[1.25rem] border border-[color:var(--border)] bg-[color:var(--background-panel)] px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-[color:var(--foreground-strong)]">
                      {operator.name}
                    </p>
                    <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--foreground-subtle)]">
                      {isCoreAdminOperatorName(operator.name) ? "Built-in operator" : "Custom operator"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDeleteOperator(operator.name)}
                    disabled={deletingOperatorName === operator.name || isCoreAdminOperatorName(operator.name)}
                    className="aurora-button-danger disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isCoreAdminOperatorName(operator.name)
                      ? "Locked"
                      : deletingOperatorName === operator.name
                        ? "Deleting..."
                        : "Delete"}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      <p className="mt-4 text-xs uppercase tracking-[0.16em] text-[color:var(--foreground-subtle)]">
        Changes apply to the wallboard and admin reporting after the next refresh.
      </p>
    </section>
  );
}
