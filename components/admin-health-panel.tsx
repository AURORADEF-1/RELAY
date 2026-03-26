"use client";

import { useCallback, useEffect, useState } from "react";
import { getAdminHealthSummary } from "@/lib/admin-health";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import { getSupabaseClient } from "@/lib/supabase";
import { fetchUsersWithPresence, type UserDirectoryRecord } from "@/lib/user-tasks";

export function AdminHealthPanel() {
  const [users, setUsers] = useState<UserDirectoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const loadHealthInputs = useCallback(async () => {
    const supabase = getSupabaseClient();

    if (!supabase) {
      setLoadError("Supabase environment variables are not configured.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const { user, isAdmin } = await getCurrentUserWithRole(supabase);

      if (!user || !isAdmin) {
        setLoadError("Admin access is required for health monitoring.");
        setIsLoading(false);
        return;
      }

      const nextUsers = await fetchUsersWithPresence(supabase);
      setUsers(nextUsers);
      setLoadError(null);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Failed to load health signals.",
      );
    } finally {
      setIsLoading(false);
      setRefreshTick((current) => current + 1);
    }
  }, []);

  useEffect(() => {
    void loadHealthInputs();
  }, [loadHealthInputs]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setRefreshTick((current) => current + 1);
    }, 15_000);

    return () => window.clearInterval(intervalId);
  }, []);

  const activeUsersCount = users.filter((user) => user.is_active).length;
  void refreshTick;
  const healthSummary = getAdminHealthSummary(activeUsersCount);
  const lastEvent = healthSummary.recentEvents[0] ?? null;

  return (
    <section className="aurora-section">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="aurora-kicker">
            Load Monitor
          </div>
          <h2 className="mt-4 aurora-heading">
            System Watch
          </h2>
          <p className="mt-3 max-w-3xl aurora-copy">
            Early warning based on active RELAY sessions and recent backend-facing client failures seen by this admin browser.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadHealthInputs()}
          disabled={isLoading}
          className="aurora-button-secondary disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? "Refreshing..." : "Refresh Health"}
        </button>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <HealthMetricCard
          label="Status"
          value={formatHealthLevel(healthSummary.level)}
          tone={healthSummary.level}
          helper={buildHealthHelper(healthSummary.level)}
        />
        <HealthMetricCard
          label="Active Users"
          value={String(activeUsersCount)}
          tone={activeUsersCount >= 12 ? "high_risk" : activeUsersCount >= 8 ? "watch" : "normal"}
          helper="Recently active sessions visible to RELAY."
        />
        <HealthMetricCard
          label="Recent Warnings"
          value={String(healthSummary.recentEvents.length)}
          tone={healthSummary.level}
          helper={
            lastEvent
              ? `Latest ${lastEvent.category.replaceAll("_", " ")} issue at ${formatHealthDate(lastEvent.createdAt)}`
              : "No warning events recorded in the last 15 minutes."
          }
        />
      </div>

      {loadError ? (
        <div className="aurora-alert aurora-alert-error mt-6">
          {loadError}
        </div>
      ) : null}

      <div className="mt-6 aurora-subpanel p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="aurora-stat-label text-sm">
            Recent Warning Signals
          </p>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-[color:var(--foreground-subtle)]">
            Last 15 minutes
          </p>
        </div>

        <div className="mt-4 space-y-3">
          {healthSummary.recentEvents.length === 0 ? (
            <div className="aurora-empty">
              No recent warning signals recorded by this admin client.
            </div>
          ) : (
            healthSummary.recentEvents.slice(0, 6).map((event) => (
              <article
                key={event.id}
                className="rounded-[1.25rem] border border-[color:var(--border)] bg-[color:var(--background-panel-strong)] px-4 py-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-[color:var(--foreground-strong)]">
                    {event.category.replaceAll("_", " ")}
                  </p>
                  <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--foreground-subtle)]">
                    {formatHealthDate(event.createdAt)}
                  </p>
                </div>
                <p className="mt-2 text-sm leading-6 text-[color:var(--foreground-muted)]">{event.message}</p>
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function HealthMetricCard({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  tone: "normal" | "watch" | "high_risk";
}) {
  const toneClasses =
    tone === "high_risk"
      ? "border-rose-200 bg-rose-50 text-rose-800"
      : tone === "watch"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-emerald-200 bg-emerald-50 text-emerald-800";

  return (
    <article className={`rounded-[1.5rem] border p-5 shadow-[var(--shadow-soft)] ${toneClasses}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">{label}</p>
      <p className="mt-3 text-3xl font-semibold">{value}</p>
      <p className="mt-3 text-sm leading-6 opacity-90">{helper}</p>
    </article>
  );
}

function formatHealthLevel(level: "normal" | "watch" | "high_risk") {
  switch (level) {
    case "high_risk":
      return "High Risk";
    case "watch":
      return "Watch";
    default:
      return "Normal";
  }
}

function buildHealthHelper(level: "normal" | "watch" | "high_risk") {
  switch (level) {
    case "high_risk":
      return "Multiple recent warning signals or elevated active session pressure.";
    case "watch":
      return "Load is building or repeated client-side failures were recently seen.";
    default:
      return "No significant warning pattern detected in recent client activity.";
  }
}

function formatHealthDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
