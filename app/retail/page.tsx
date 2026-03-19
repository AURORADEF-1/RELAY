"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { LogoutButton } from "@/components/logout-button";
import { NotificationBadge } from "@/components/notification-badge";
import { useNotifications } from "@/components/notification-provider";
import { RelayLogo } from "@/components/relay-logo";
import { RetailNav } from "@/components/retail-nav";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import {
  DEFAULT_MONTHLY_RETAIL_TARGET,
  exportRetailLeadsCsv,
  fetchRetailSnapshot,
  formatCurrency,
  formatDate,
  getRetailDashboardMetrics,
  labelRetailValue,
  type RetailLead,
  type RetailOwner,
  type RetailSnapshot,
} from "@/lib/retail";
import { sanitizeUserFacingError } from "@/lib/security";
import { getSupabaseClient } from "@/lib/supabase";

export default function RetailPage() {
  const { adminBadgeCount, isAdmin, requesterUnreadCount, taskUnreadCount } = useNotifications();
  const [snapshot, setSnapshot] = useState<RetailSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");

  const loadRetail = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");
    setNotice("");

    const supabase = getSupabaseClient();

    if (!supabase) {
      setSnapshot(null);
      setErrorMessage("Supabase environment variables are not configured.");
      setIsLoading(false);
      return;
    }

    try {
      const { user, isAdmin } = await getCurrentUserWithRole(supabase);

      if (!user || !isAdmin) {
        setSnapshot(null);
        setErrorMessage("Admin access is required for retail reporting.");
        setIsLoading(false);
        return;
      }

      const nextSnapshot = await fetchRetailSnapshot(supabase);
      setSnapshot(nextSnapshot);
    } catch (error) {
      setSnapshot(null);
      setErrorMessage(
        sanitizeUserFacingError(error, "Unable to load retail CRM data."),
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadRetail();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadRetail]);

  const metrics = useMemo(
    () => (snapshot ? getRetailDashboardMetrics(snapshot) : null),
    [snapshot],
  );

  const ownersById = useMemo(
    () => new Map((snapshot?.owners ?? []).map((owner) => [owner.id, owner])),
    [snapshot?.owners],
  );

  const filteredLeads = useMemo(() => {
    const leads = snapshot?.leads ?? [];
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return leads;
    }

    return leads.filter((lead) =>
      [
        lead.customer_name,
        lead.company_name,
        lead.contact_name,
        lead.request_summary,
        lead.quote_reference,
      ]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase().includes(normalizedQuery)),
    );
  }, [query, snapshot?.leads]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#f8fafc_0%,#eef2f7_48%,#e2e8f0_100%)] px-6 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <nav className="flex flex-wrap items-center justify-between gap-4 rounded-[1.75rem] border border-white/70 bg-white/80 px-5 py-4 shadow-[0_18px_55px_-34px_rgba(15,23,42,0.35)] backdrop-blur">
          <RelayLogo />
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-600">
            <Link href="/" className="rounded-full px-4 py-2 hover:bg-white">
              Home
            </Link>
            <Link href="/legal" className="rounded-full px-4 py-2 hover:bg-white">
              Legal
            </Link>
            <Link href="/settings" className="rounded-full px-4 py-2 hover:bg-white">
              Settings
            </Link>
            <Link href="/submit" className="rounded-full px-4 py-2 hover:bg-white">
              Submit Ticket
            </Link>
            <Link href="/requests" className="rounded-full px-4 py-2 hover:bg-white">
              My Requests
              <NotificationBadge count={requesterUnreadCount} />
            </Link>
            <Link href="/tasks" className="rounded-full px-4 py-2 hover:bg-white">
              Tasks
              <NotificationBadge count={taskUnreadCount} />
            </Link>
            {isAdmin ? (
              <>
                <Link href="/incidents" className="rounded-full px-4 py-2 hover:bg-white">
                  Workshop Control
                </Link>
                <Link href="/admin" className="rounded-full px-4 py-2 hover:bg-white">
                  Parts Control
                  <NotificationBadge count={adminBadgeCount} />
                </Link>
                <Link href="/retail" className="rounded-full bg-slate-950 px-4 py-2 text-white">
                  Retail
                </Link>
              </>
            ) : null}
            <LogoutButton />
          </div>
        </nav>

        <AuthGuard requiredRole="admin">
          <section className="rounded-[2rem] border border-white/80 bg-white/90 p-8 shadow-[0_28px_80px_-32px_rgba(15,23,42,0.35)] backdrop-blur sm:p-10">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-4">
                <div className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-700">
                  Retail CRM
                </div>
                <div className="space-y-2">
                  <h1 className="text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">
                    Sales dashboard and quote pipeline
                  </h1>
                  <p className="max-w-3xl text-base leading-8 text-slate-600">
                    Track retail enquiries, quote movement, assigned owners, won business, and progress against the monthly target of {formatCurrency(DEFAULT_MONTHLY_RETAIL_TARGET)}.
                  </p>
                </div>
              </div>

              <RetailNav />
            </div>

            {errorMessage ? (
              <div className="mt-8 rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
                {errorMessage}
              </div>
            ) : null}

            {notice ? (
              <div className="mt-8 rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">
                {notice}
              </div>
            ) : null}

            {isLoading ? (
              <div className="mt-8 rounded-3xl border border-slate-200 bg-slate-50 px-5 py-8 text-sm text-slate-500">
                Loading retail dashboard...
              </div>
            ) : null}

            {!isLoading && snapshot?.setupRequired ? <RetailSetupCallout /> : null}

            {!isLoading && snapshot && !snapshot.setupRequired && metrics ? (
              <div className="mt-8 space-y-8">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <MetricCard label="Monthly Sales" value={formatCurrency(metrics.monthlySales)} detail={`${metrics.monthProgress.toFixed(0)}% of target`} />
                  <MetricCard label="Weekly Sales" value={formatCurrency(metrics.weeklySales)} detail="Last 7 days" />
                  <MetricCard label="Yearly Sales" value={formatCurrency(metrics.yearlySales)} detail="Closed retail sales" />
                  <MetricCard label="Active Pipeline" value={formatCurrency(metrics.activePipelineValue)} detail={`${metrics.openLeads} open opportunities`} />
                </div>

                <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                  <section className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 className="text-xl font-semibold tracking-[-0.03em] text-slate-950">
                          Monthly target
                        </h2>
                        <p className="mt-1 text-sm text-slate-600">
                          Won this month: {formatCurrency(metrics.wonThisMonth)} of {formatCurrency(metrics.monthTarget)}
                        </p>
                      </div>
                      <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Overdue quotes: {metrics.overdueQuotes}
                      </div>
                    </div>
                    <div className="mt-6 h-4 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-emerald-600 transition-[width]"
                        style={{ width: `${Math.max(8, metrics.monthProgress)}%` }}
                      />
                    </div>
                    <div className="mt-6 grid gap-4 md:grid-cols-3">
                      <MiniMetric label="Quoted value" value={formatCurrency(metrics.quotedValue)} />
                      <MiniMetric label="Won this month" value={formatCurrency(metrics.wonThisMonth)} />
                      <MiniMetric label="Open leads" value={String(metrics.openLeads)} />
                    </div>
                  </section>

                  <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6">
                    <h2 className="text-xl font-semibold tracking-[-0.03em] text-slate-950">
                      Pipeline by stage
                    </h2>
                    <div className="mt-5 space-y-4">
                      {metrics.stageBreakdown.length === 0 ? (
                        <p className="text-sm text-slate-500">No active pipeline records yet.</p>
                      ) : (
                        metrics.stageBreakdown.map((stage) => (
                          <div key={stage.stage} className="space-y-2">
                            <div className="flex items-center justify-between gap-4 text-sm">
                              <span className="font-medium text-slate-700">{stage.stage}</span>
                              <span className="text-slate-500">
                                {stage.count} deals · {formatCurrency(stage.value)}
                              </span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                              <div
                                className="h-full rounded-full bg-slate-900"
                                style={{
                                  width: `${Math.min(100, metrics.activePipelineValue > 0 ? (stage.value / metrics.activePipelineValue) * 100 : 0)}%`,
                                }}
                              />
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </section>
                </div>

                <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
                  <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 className="text-xl font-semibold tracking-[-0.03em] text-slate-950">
                          Quote pipeline
                        </h2>
                        <p className="mt-1 text-sm text-slate-600">
                          Search by customer, company, contact, summary, or quote reference.
                        </p>
                      </div>
                      <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row">
                        <input
                          value={query}
                          onChange={(event) => setQuery(event.target.value)}
                          placeholder="Search retail pipeline"
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-slate-400 md:w-72"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            exportRetailLeadsCsv(filteredLeads);
                            setNotice(
                              `Exported ${filteredLeads.length} retail record${filteredLeads.length === 1 ? "" : "s"}.`,
                            );
                          }}
                          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                        >
                          Export CSV
                        </button>
                      </div>
                    </div>

                    <div className="mt-5 overflow-x-auto">
                      <table className="min-w-full text-left text-sm">
                        <thead className="text-xs uppercase tracking-[0.18em] text-slate-500">
                          <tr>
                            <th className="pb-3 pr-4 font-medium">Customer</th>
                            <th className="pb-3 pr-4 font-medium">Stage</th>
                            <th className="pb-3 pr-4 font-medium">Quote</th>
                            <th className="pb-3 pr-4 font-medium">Owner</th>
                            <th className="pb-3 font-medium">Updated</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredLeads.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="py-8 text-center text-sm text-slate-500">
                                No retail opportunities match the current search.
                              </td>
                            </tr>
                          ) : (
                            filteredLeads.slice(0, 12).map((lead) => (
                              <RetailLeadRow key={lead.id} lead={lead} ownersById={ownersById} />
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-6">
                    <h2 className="text-xl font-semibold tracking-[-0.03em] text-slate-950">
                      Sales by owner
                    </h2>
                    <div className="mt-5 space-y-4">
                      {metrics.ownerBreakdown.length === 0 ? (
                        <p className="text-sm text-slate-500">No assigned retail records yet.</p>
                      ) : (
                        metrics.ownerBreakdown.map((owner) => (
                          <div
                            key={owner.ownerId ?? owner.ownerName}
                            className="rounded-3xl border border-slate-200 bg-white px-4 py-4"
                          >
                            <div className="flex items-center justify-between gap-4">
                              <div>
                                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                                  {owner.ownerName}
                                </p>
                                <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">
                                  {formatCurrency(owner.wonValue)}
                                </p>
                              </div>
                              <div className="text-right text-sm text-slate-600">
                                <p>{owner.openLeads} open leads</p>
                                <p>{formatCurrency(owner.quoteValue)} quoted</p>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </section>
                </div>
              </div>
            ) : null}
          </section>
        </AuthGuard>
      </div>
    </main>
  );
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-slate-950">{value}</p>
      <p className="mt-2 text-sm text-slate-600">{detail}</p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950">{value}</p>
    </div>
  );
}

function RetailLeadRow({
  lead,
  ownersById,
}: {
  lead: RetailLead;
  ownersById: Map<string, RetailOwner>;
}) {
  const owner = lead.assigned_user_id ? ownersById.get(lead.assigned_user_id) : null;
  const ownerName = owner?.full_name || owner?.username || "Unassigned";

  return (
    <tr className="border-t border-slate-100">
      <td className="py-4 pr-4 align-top">
        <div className="space-y-1">
          <Link href={`/retail/${lead.id}`} className="font-medium text-slate-900 transition hover:text-slate-600">
            {lead.customer_name || lead.company_name || "Untitled retail lead"}
          </Link>
          <p className="text-slate-500">
            {[lead.company_name, lead.contact_name].filter(Boolean).join(" · ") || "No contact details"}
          </p>
        </div>
      </td>
      <td className="py-4 pr-4 align-top">
        <div className="space-y-1">
          <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
            {labelRetailValue(lead.pipeline_stage)}
          </span>
          <p className="text-slate-500">{labelRetailValue(lead.lead_status)}</p>
        </div>
      </td>
      <td className="py-4 pr-4 align-top">
        <div className="space-y-1">
          <p className="font-medium text-slate-900">{formatCurrency(lead.quote_value ?? lead.estimated_value)}</p>
          <p className="text-slate-500">{lead.quote_reference || "No quote ref"}</p>
        </div>
      </td>
      <td className="py-4 pr-4 align-top text-slate-600">{ownerName}</td>
      <td className="py-4 align-top text-slate-600">{formatDate(lead.updated_at ?? lead.created_at)}</td>
    </tr>
  );
}

function RetailSetupCallout() {
  return (
    <div className="mt-8 rounded-[1.75rem] border border-amber-200 bg-amber-50 p-6 text-amber-900">
      <h2 className="text-lg font-semibold tracking-[-0.02em]">Retail schema not applied yet</h2>
      <p className="mt-2 max-w-3xl text-sm leading-7">
        The retail dashboard UI is in place, but the Supabase tables are not present yet. Apply the SQL in the schema file below to enable lead capture, quote tracking, sales logging, owner assignment, and monthly targets.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link href="/retail/new" className="rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white">
          Open capture form
        </Link>
        <code className="rounded-full border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-900">
          docs/retail-crm-schema.sql
        </code>
      </div>
    </div>
  );
}
