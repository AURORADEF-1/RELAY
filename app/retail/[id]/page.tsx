"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { LogoutButton } from "@/components/logout-button";
import { NotificationBadge } from "@/components/notification-badge";
import { useNotifications } from "@/components/notification-provider";
import { RelayLogo } from "@/components/relay-logo";
import { RetailNav } from "@/components/retail-nav";
import { triggerActionFeedback } from "@/lib/action-feedback";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import {
  createRetailActivity,
  createRetailSale,
  fetchRetailLeadById,
  formatCurrency,
  formatDate,
  isMissingRetailTableError,
  labelRetailValue,
  syncRetailQuote,
  updateRetailLead,
  type RetailActivity,
  type RetailLead,
  type RetailOwner,
  type RetailSale,
} from "@/lib/retail";
import { sanitizeUserFacingError } from "@/lib/security";
import { getSupabaseClient } from "@/lib/supabase";

type LeadFormState = {
  customer_name: string;
  company_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  request_summary: string;
  request_details: string;
  source: string;
  pipeline_stage: string;
  lead_status: string;
  assigned_user_id: string;
  estimated_value: string;
  quote_value: string;
  quote_reference: string;
  quote_status: string;
  quote_valid_until: string;
  sale_amount: string;
  notes: string;
};

export default function RetailLeadPage() {
  const params = useParams<{ id: string }>();
  const leadId = typeof params?.id === "string" ? params.id : "";
  const { adminBadgeCount, isAdmin, requesterUnreadCount, taskUnreadCount } = useNotifications();
  const [lead, setLead] = useState<RetailLead | null>(null);
  const [owners, setOwners] = useState<RetailOwner[]>([]);
  const [activities, setActivities] = useState<RetailActivity[]>([]);
  const [sales, setSales] = useState<RetailSale[]>([]);
  const [formState, setFormState] = useState<LeadFormState | null>(null);
  const [activityNote, setActivityNote] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoggingActivity, setIsLoggingActivity] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const loadLead = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");
    setNotice("");

    const supabase = getSupabaseClient();

    if (!supabase) {
      setErrorMessage("Supabase environment variables are not configured.");
      setIsLoading(false);
      return;
    }

    try {
      const { user, isAdmin } = await getCurrentUserWithRole(supabase);

      if (!user || !isAdmin) {
        setErrorMessage("Admin access is required for retail CRM.");
        setIsLoading(false);
        return;
      }

      setCurrentUserId(user.id);

      const result = await fetchRetailLeadById(supabase, leadId);

      setSetupRequired(result.setupRequired);
      setOwners(result.owners);
      setActivities(result.activities);
      setSales(result.sales);
      setLead(result.lead);
      setFormState(result.lead ? mapLeadToForm(result.lead) : null);
    } catch (error) {
      setErrorMessage(
        sanitizeUserFacingError(error, "Unable to load retail lead."),
      );
    } finally {
      setIsLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    if (!leadId) {
      setErrorMessage("Retail lead id is missing.");
      setIsLoading(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void loadLead();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [leadId, loadLead]);

  const ownerLabel = useMemo(() => {
    if (!formState?.assigned_user_id) {
      return "Unassigned";
    }

    const owner = owners.find((entry) => entry.id === formState.assigned_user_id);
    return owner?.full_name || owner?.username || "Assigned";
  }, [formState?.assigned_user_id, owners]);

  async function handleSave() {
    if (!formState || !lead) {
      return;
    }

    setIsSaving(true);
    setErrorMessage("");
    setNotice("");

    const supabase = getSupabaseClient();

    if (!supabase) {
      setErrorMessage("Supabase environment variables are not configured.");
      setIsSaving(false);
      return;
    }

    try {
      const timestamp = new Date().toISOString();
      const isWon = formState.lead_status === "won";
      const isLost = formState.lead_status === "lost";
      const updatedLead = await updateRetailLead(supabase, lead.id, {
        customer_name: formState.customer_name.trim(),
        company_name: trimToNull(formState.company_name),
        contact_name: trimToNull(formState.contact_name),
        contact_email: trimToNull(formState.contact_email),
        contact_phone: trimToNull(formState.contact_phone),
        request_summary: trimToNull(formState.request_summary),
        request_details: trimToNull(formState.request_details),
        source: trimToNull(formState.source),
        pipeline_stage: trimToNull(formState.pipeline_stage),
        lead_status: trimToNull(formState.lead_status),
        assigned_user_id: trimToNull(formState.assigned_user_id),
        estimated_value: parseMoney(formState.estimated_value),
        quote_value: parseMoney(formState.quote_value),
        quote_reference: trimToNull(formState.quote_reference),
        quote_status: trimToNull(formState.quote_status),
        quote_valid_until: trimToNull(formState.quote_valid_until),
        quoted_at: formState.quote_reference ? lead.quoted_at ?? timestamp : null,
        won_at: isWon ? lead.won_at ?? timestamp : null,
        lost_at: isLost ? lead.lost_at ?? timestamp : null,
        sale_amount: parseMoney(formState.sale_amount) ?? parseMoney(formState.quote_value),
        notes: trimToNull(formState.notes),
      });

      await syncRetailQuote(supabase, {
        lead_id: lead.id,
        quote_reference: trimToNull(formState.quote_reference),
        status: trimToNull(formState.quote_status),
        total_value: parseMoney(formState.quote_value),
        valid_until: trimToNull(formState.quote_valid_until),
        assigned_user_id: trimToNull(formState.assigned_user_id),
      });

      await createRetailActivity(supabase, {
        lead_id: lead.id,
        activity_type: "status_change",
        activity_text: `Lead updated to ${labelRetailValue(updatedLead.lead_status)} in ${labelRetailValue(updatedLead.pipeline_stage)}.`,
        created_by: currentUserId,
      });

      const existingSale = sales[0];
      const saleAmount = parseMoney(formState.sale_amount) ?? parseMoney(formState.quote_value);

      if (isWon && saleAmount && !existingSale) {
        const sale = await createRetailSale(supabase, {
          lead_id: lead.id,
          assigned_user_id: trimToNull(formState.assigned_user_id),
          amount: saleAmount,
          notes: trimToNull(formState.notes),
        });
        setSales((current) => [sale, ...current]);
      }

      triggerActionFeedback();
      setLead(updatedLead);
      setFormState(mapLeadToForm(updatedLead));
      setActivities((current) => [
        {
          id: `local-${Date.now()}`,
          lead_id: lead.id,
          activity_type: "status_change",
          activity_text: `Lead updated to ${labelRetailValue(updatedLead.lead_status)} in ${labelRetailValue(updatedLead.pipeline_stage)}.`,
          created_by: currentUserId,
          created_at: new Date().toISOString(),
        },
        ...current,
      ]);
      setNotice("Retail lead updated.");
    } catch (error) {
      if (isMissingRetailTableError(error)) {
        setSetupRequired(true);
        setErrorMessage("Retail schema is not applied yet.");
      } else {
        setErrorMessage(
          sanitizeUserFacingError(error, "Unable to update retail lead."),
        );
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function handleLogActivity() {
    if (!lead || !activityNote.trim()) {
      return;
    }

    setIsLoggingActivity(true);
    setErrorMessage("");
    setNotice("");

    const supabase = getSupabaseClient();

    if (!supabase) {
      setErrorMessage("Supabase environment variables are not configured.");
      setIsLoggingActivity(false);
      return;
    }

    try {
      const activity = await createRetailActivity(supabase, {
        lead_id: lead.id,
        activity_type: "note",
        activity_text: activityNote.trim(),
        created_by: currentUserId,
      });

      triggerActionFeedback();
      setActivities((current) => [activity, ...current]);
      setActivityNote("");
      setNotice("Activity note logged.");
    } catch (error) {
      setErrorMessage(
        sanitizeUserFacingError(error, "Unable to log retail activity."),
      );
    } finally {
      setIsLoggingActivity(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#f8fafc_0%,#eef2f7_48%,#e2e8f0_100%)] px-6 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <nav className="flex flex-wrap items-center justify-between gap-4 rounded-[1.75rem] border border-white/70 bg-white/80 px-5 py-4 shadow-[0_18px_55px_-34px_rgba(15,23,42,0.35)] backdrop-blur">
          <RelayLogo />
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-600">
            <Link href="/" className="rounded-full px-4 py-2 hover:bg-white">Home</Link>
            <Link href="/legal" className="rounded-full px-4 py-2 hover:bg-white">Legal</Link>
            <Link href="/settings" className="rounded-full px-4 py-2 hover:bg-white">Settings</Link>
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
                <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-600">
                  Retail Lead
                </div>
                <div className="space-y-2">
                  <h1 className="text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">
                    {lead?.customer_name || lead?.company_name || "Retail lead"}
                  </h1>
                  <p className="max-w-3xl text-base leading-8 text-slate-600">
                    Manage the quote pipeline, owner assignment, CRM notes, and sales logging for this retail opportunity.
                  </p>
                </div>
              </div>

              <RetailNav />
            </div>

            {errorMessage ? <Notice tone="error" message={errorMessage} /> : null}
            {notice ? <Notice tone="success" message={notice} /> : null}

            {isLoading ? (
              <div className="mt-8 rounded-3xl border border-slate-200 bg-slate-50 px-5 py-8 text-sm text-slate-500">
                Loading retail lead...
              </div>
            ) : null}

            {!isLoading && setupRequired ? (
              <div className="mt-8 rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
                Apply <code>docs/retail-crm-schema.sql</code> before using retail CRM records.
              </div>
            ) : null}

            {!isLoading && !setupRequired && !lead ? (
              <div className="mt-8 rounded-3xl border border-slate-200 bg-slate-50 px-5 py-8 text-sm text-slate-500">
                Retail lead not found.
              </div>
            ) : null}

            {!isLoading && !setupRequired && lead && formState ? (
              <div className="mt-8 grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-6">
                  <section className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h2 className="text-xl font-semibold tracking-[-0.03em] text-slate-950">
                        Lead details
                      </h2>
                      <Link href="/retail" className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700">
                        Back to dashboard
                      </Link>
                    </div>
                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                      <Field label="Customer name"><input value={formState.customer_name} onChange={(event) => updateForm(setFormState, "customer_name", event.target.value)} className={inputClassName} /></Field>
                      <Field label="Company"><input value={formState.company_name} onChange={(event) => updateForm(setFormState, "company_name", event.target.value)} className={inputClassName} /></Field>
                      <Field label="Contact name"><input value={formState.contact_name} onChange={(event) => updateForm(setFormState, "contact_name", event.target.value)} className={inputClassName} /></Field>
                      <Field label="Contact email"><input value={formState.contact_email} onChange={(event) => updateForm(setFormState, "contact_email", event.target.value)} className={inputClassName} /></Field>
                      <Field label="Contact phone"><input value={formState.contact_phone} onChange={(event) => updateForm(setFormState, "contact_phone", event.target.value)} className={inputClassName} /></Field>
                      <Field label="Source"><input value={formState.source} onChange={(event) => updateForm(setFormState, "source", event.target.value)} className={inputClassName} /></Field>
                    </div>
                    <div className="mt-4 grid gap-4">
                      <Field label="Request summary"><input value={formState.request_summary} onChange={(event) => updateForm(setFormState, "request_summary", event.target.value)} className={inputClassName} /></Field>
                      <Field label="Request details"><textarea value={formState.request_details} onChange={(event) => updateForm(setFormState, "request_details", event.target.value)} rows={6} className={`${inputClassName} resize-y`} /></Field>
                    </div>
                  </section>

                  <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6">
                    <h2 className="text-xl font-semibold tracking-[-0.03em] text-slate-950">
                      Pipeline and quote
                    </h2>
                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                      <Field label="Pipeline stage">
                        <select value={formState.pipeline_stage} onChange={(event) => updateForm(setFormState, "pipeline_stage", event.target.value)} className={inputClassName}>
                          <option value="new">New</option>
                          <option value="qualified">Qualified</option>
                          <option value="quoted">Quoted</option>
                          <option value="follow_up">Follow Up</option>
                          <option value="negotiation">Negotiation</option>
                          <option value="won">Won</option>
                          <option value="lost">Lost</option>
                        </select>
                      </Field>
                      <Field label="Lead status">
                        <select value={formState.lead_status} onChange={(event) => updateForm(setFormState, "lead_status", event.target.value)} className={inputClassName}>
                          <option value="new">New</option>
                          <option value="active">Active</option>
                          <option value="quoted">Quoted</option>
                          <option value="won">Won</option>
                          <option value="lost">Lost</option>
                          <option value="closed">Closed</option>
                        </select>
                      </Field>
                      <Field label="Assigned owner">
                        <select value={formState.assigned_user_id} onChange={(event) => updateForm(setFormState, "assigned_user_id", event.target.value)} className={inputClassName}>
                          <option value="">Unassigned</option>
                          {owners.map((owner) => (
                            <option key={owner.id} value={owner.id}>
                              {owner.full_name || owner.username || owner.id}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Estimated value"><input value={formState.estimated_value} onChange={(event) => updateForm(setFormState, "estimated_value", event.target.value)} className={inputClassName} /></Field>
                      <Field label="Quote value"><input value={formState.quote_value} onChange={(event) => updateForm(setFormState, "quote_value", event.target.value)} className={inputClassName} /></Field>
                      <Field label="Sale amount"><input value={formState.sale_amount} onChange={(event) => updateForm(setFormState, "sale_amount", event.target.value)} className={inputClassName} /></Field>
                      <Field label="Quote reference"><input value={formState.quote_reference} onChange={(event) => updateForm(setFormState, "quote_reference", event.target.value)} className={inputClassName} /></Field>
                      <Field label="Quote status">
                        <select value={formState.quote_status} onChange={(event) => updateForm(setFormState, "quote_status", event.target.value)} className={inputClassName}>
                          <option value="draft">Draft</option>
                          <option value="sent">Sent</option>
                          <option value="accepted">Accepted</option>
                          <option value="expired">Expired</option>
                          <option value="rejected">Rejected</option>
                        </select>
                      </Field>
                      <Field label="Valid until"><input type="date" value={formState.quote_valid_until} onChange={(event) => updateForm(setFormState, "quote_valid_until", event.target.value)} className={inputClassName} /></Field>
                    </div>
                    <div className="mt-4">
                      <Field label="Internal notes">
                        <textarea value={formState.notes} onChange={(event) => updateForm(setFormState, "notes", event.target.value)} rows={8} className={`${inputClassName} resize-y`} />
                      </Field>
                    </div>
                    <div className="mt-6 flex flex-wrap gap-3">
                      <button type="button" onClick={() => void handleSave()} disabled={isSaving} className="rounded-full bg-slate-950 px-5 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400">
                        {isSaving ? "Saving..." : "Save lead"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          updateForm(setFormState, "lead_status", "won");
                          updateForm(setFormState, "pipeline_stage", "won");
                        }}
                        className="rounded-full border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-medium text-emerald-700"
                      >
                        Mark as won
                      </button>
                    </div>
                  </section>
                </div>

                <div className="space-y-6">
                  <section className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-6">
                    <h2 className="text-xl font-semibold tracking-[-0.03em] text-slate-950">
                      Snapshot
                    </h2>
                    <div className="mt-5 space-y-4">
                      <SummaryRow label="Owner" value={ownerLabel} />
                      <SummaryRow label="Stage" value={labelRetailValue(formState.pipeline_stage)} />
                      <SummaryRow label="Status" value={labelRetailValue(formState.lead_status)} />
                      <SummaryRow label="Quote value" value={formatCurrency(parseMoney(formState.quote_value))} />
                      <SummaryRow label="Sale amount" value={formatCurrency(parseMoney(formState.sale_amount) ?? lead.sale_amount)} />
                      <SummaryRow label="Last updated" value={formatDate(lead.updated_at ?? lead.created_at)} />
                    </div>
                  </section>

                  <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6">
                    <h2 className="text-xl font-semibold tracking-[-0.03em] text-slate-950">
                      Activity log
                    </h2>
                    <div className="mt-5 space-y-3">
                      <textarea
                        value={activityNote}
                        onChange={(event) => setActivityNote(event.target.value)}
                        rows={4}
                        placeholder="Log call notes, quote feedback, or next actions"
                        className={`${inputClassName} resize-y`}
                      />
                      <button
                        type="button"
                        onClick={() => void handleLogActivity()}
                        disabled={isLoggingActivity || !activityNote.trim()}
                        className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:text-slate-400"
                      >
                        {isLoggingActivity ? "Logging..." : "Add note"}
                      </button>
                    </div>

                    <div className="mt-6 space-y-3">
                      {activities.length === 0 ? (
                        <p className="text-sm text-slate-500">No CRM activity logged yet.</p>
                      ) : (
                        activities.map((activity) => (
                          <div key={activity.id} className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                            <div className="flex items-center justify-between gap-4">
                              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                {labelRetailValue(activity.activity_type)}
                              </p>
                              <p className="text-xs text-slate-500">{formatDate(activity.created_at)}</p>
                            </div>
                            <p className="mt-2 text-sm leading-7 text-slate-700">{activity.activity_text || "No detail"}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </section>

                  <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6">
                    <h2 className="text-xl font-semibold tracking-[-0.03em] text-slate-950">
                      Sales history
                    </h2>
                    <div className="mt-5 space-y-3">
                      {sales.length === 0 ? (
                        <p className="text-sm text-slate-500">No sales logged yet for this lead.</p>
                      ) : (
                        sales.map((sale) => (
                          <div key={sale.id} className="flex items-center justify-between gap-4 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                            <div>
                              <p className="text-sm font-medium text-slate-900">{formatCurrency(sale.amount)}</p>
                              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{formatDate(sale.closed_at)}</p>
                            </div>
                            <span className="text-sm text-slate-600">{ownerLabel}</span>
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

function updateForm(
  setFormState: React.Dispatch<React.SetStateAction<LeadFormState | null>>,
  key: keyof LeadFormState,
  value: string,
) {
  setFormState((current) => (current ? { ...current, [key]: value } : current));
}

function mapLeadToForm(lead: RetailLead): LeadFormState {
  return {
    customer_name: lead.customer_name ?? "",
    company_name: lead.company_name ?? "",
    contact_name: lead.contact_name ?? "",
    contact_email: lead.contact_email ?? "",
    contact_phone: lead.contact_phone ?? "",
    request_summary: lead.request_summary ?? "",
    request_details: lead.request_details ?? "",
    source: lead.source ?? "retail",
    pipeline_stage: lead.pipeline_stage ?? "new",
    lead_status: lead.lead_status ?? "new",
    assigned_user_id: lead.assigned_user_id ?? "",
    estimated_value: lead.estimated_value?.toString() ?? "",
    quote_value: lead.quote_value?.toString() ?? "",
    quote_reference: lead.quote_reference ?? "",
    quote_status: lead.quote_status ?? "draft",
    quote_valid_until: lead.quote_valid_until ?? "",
    sale_amount: lead.sale_amount?.toString() ?? "",
    notes: lead.notes ?? "",
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-medium text-slate-700">
      <span>{label}</span>
      {children}
    </label>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-900">{value}</span>
    </div>
  );
}

function Notice({ tone, message }: { tone: "success" | "error"; message: string }) {
  return (
    <div
      className={`mt-8 rounded-3xl px-5 py-4 text-sm ${
        tone === "success"
          ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border border-rose-200 bg-rose-50 text-rose-700"
      }`}
    >
      {message}
    </div>
  );
}

function trimToNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseMoney(value: string) {
  const normalized = value.replace(/,/g, "").trim();

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

const inputClassName =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-slate-400";
