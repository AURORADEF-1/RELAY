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
  createRetailLead,
  fetchRetailOwners,
  formatCurrency,
  isMissingRetailTableError,
  type RetailOwner,
} from "@/lib/retail";
import { sanitizeUserFacingError } from "@/lib/security";
import { getSupabaseClient } from "@/lib/supabase";

const initialFormState = {
  customer_name: "",
  company_name: "",
  contact_name: "",
  contact_email: "",
  contact_phone: "",
  request_summary: "",
  request_details: "",
  source: "retail",
  pipeline_stage: "new",
  lead_status: "new",
  assigned_user_id: "",
  estimated_value: "",
  quote_value: "",
  quote_reference: "",
  quote_status: "draft",
  quote_valid_until: "",
  notes: "",
};

export default function NewRetailPage() {
  const { adminBadgeCount, isAdmin, requesterUnreadCount, taskUnreadCount } = useNotifications();
  const [owners, setOwners] = useState<RetailOwner[]>([]);
  const [formState, setFormState] = useState(initialFormState);
  const [isLoadingOwners, setIsLoadingOwners] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [setupRequired, setSetupRequired] = useState(false);

  const loadOwners = useCallback(async () => {
    setIsLoadingOwners(true);
    setErrorMessage("");

    const supabase = getSupabaseClient();

    if (!supabase) {
      setOwners([]);
      setErrorMessage("Supabase environment variables are not configured.");
      setIsLoadingOwners(false);
      return;
    }

    try {
      const { user, isAdmin } = await getCurrentUserWithRole(supabase);

      if (!user || !isAdmin) {
        setOwners([]);
        setErrorMessage("Admin access is required for retail capture.");
        setIsLoadingOwners(false);
        return;
      }

      const nextOwners = await fetchRetailOwners(supabase);
      setOwners(nextOwners);
    } catch (error) {
      setOwners([]);
      setErrorMessage(
        sanitizeUserFacingError(error, "Unable to load retail owners."),
      );
    } finally {
      setIsLoadingOwners(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadOwners();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadOwners]);

  const selectedOwnerLabel = useMemo(() => {
    if (!formState.assigned_user_id) {
      return "Unassigned";
    }

    const owner = owners.find((entry) => entry.id === formState.assigned_user_id);
    return owner?.full_name || owner?.username || "Assigned";
  }, [formState.assigned_user_id, owners]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    setSetupRequired(false);

    const supabase = getSupabaseClient();

    if (!supabase) {
      setErrorMessage("Supabase environment variables are not configured.");
      setIsSaving(false);
      return;
    }

    try {
      const payload = {
        customer_name: formState.customer_name.trim(),
        company_name: trimToNull(formState.company_name),
        contact_name: trimToNull(formState.contact_name),
        contact_email: trimToNull(formState.contact_email),
        contact_phone: trimToNull(formState.contact_phone),
        request_summary: formState.request_summary.trim(),
        request_details: trimToNull(formState.request_details),
        source: trimToNull(formState.source),
        pipeline_stage: formState.pipeline_stage,
        lead_status: formState.lead_status,
        assigned_user_id: trimToNull(formState.assigned_user_id),
        estimated_value: parseMoney(formState.estimated_value),
        quote_value: parseMoney(formState.quote_value),
        quote_reference: trimToNull(formState.quote_reference),
        quote_status: trimToNull(formState.quote_status),
        quote_valid_until: trimToNull(formState.quote_valid_until),
        notes: trimToNull(formState.notes),
      };

      if (!payload.customer_name || !payload.request_summary) {
        throw new Error("Customer name and request summary are required.");
      }

      await createRetailLead(supabase, payload);
      setSuccessMessage(`Retail request saved and assigned to ${selectedOwnerLabel}.`);
      setFormState(initialFormState);
    } catch (error) {
      if (isMissingRetailTableError(error)) {
        setSetupRequired(true);
        setErrorMessage("Retail schema is not applied yet.");
      } else {
        setErrorMessage(
          sanitizeUserFacingError(error, "Unable to save the retail request."),
        );
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#f8fafc_0%,#eef2f7_48%,#e2e8f0_100%)] px-6 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-6xl space-y-8">
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
                <div className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700">
                  Retail Capture
                </div>
                <div className="space-y-2">
                  <h1 className="text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">
                    New retail request
                  </h1>
                  <p className="max-w-3xl text-base leading-8 text-slate-600">
                    Capture a retail enquiry, prepare a quote, assign an owner, and push it into the sales pipeline in one step.
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

            {successMessage ? (
              <div className="mt-8 rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">
                {successMessage}
              </div>
            ) : null}

            {setupRequired ? (
              <div className="mt-8 rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
                Apply <code>docs/retail-crm-schema.sql</code> before saving records from this form.
              </div>
            ) : null}

            <form onSubmit={handleSubmit} className="mt-8 grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-6">
                <section className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-6">
                  <h2 className="text-xl font-semibold tracking-[-0.03em] text-slate-950">
                    Customer and enquiry
                  </h2>
                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <Field label="Customer name" required>
                      <input value={formState.customer_name} onChange={(event) => setFormState((current) => ({ ...current, customer_name: event.target.value }))} className={inputClassName} />
                    </Field>
                    <Field label="Company">
                      <input value={formState.company_name} onChange={(event) => setFormState((current) => ({ ...current, company_name: event.target.value }))} className={inputClassName} />
                    </Field>
                    <Field label="Contact name">
                      <input value={formState.contact_name} onChange={(event) => setFormState((current) => ({ ...current, contact_name: event.target.value }))} className={inputClassName} />
                    </Field>
                    <Field label="Contact email">
                      <input type="email" value={formState.contact_email} onChange={(event) => setFormState((current) => ({ ...current, contact_email: event.target.value }))} className={inputClassName} />
                    </Field>
                    <Field label="Contact phone">
                      <input value={formState.contact_phone} onChange={(event) => setFormState((current) => ({ ...current, contact_phone: event.target.value }))} className={inputClassName} />
                    </Field>
                    <Field label="Source">
                      <input value={formState.source} onChange={(event) => setFormState((current) => ({ ...current, source: event.target.value }))} className={inputClassName} />
                    </Field>
                  </div>
                  <div className="mt-4 grid gap-4">
                    <Field label="Request summary" required>
                      <input value={formState.request_summary} onChange={(event) => setFormState((current) => ({ ...current, request_summary: event.target.value }))} className={inputClassName} />
                    </Field>
                    <Field label="Request details">
                      <textarea value={formState.request_details} onChange={(event) => setFormState((current) => ({ ...current, request_details: event.target.value }))} rows={6} className={`${inputClassName} resize-y`} />
                    </Field>
                  </div>
                </section>

                <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6">
                  <h2 className="text-xl font-semibold tracking-[-0.03em] text-slate-950">
                    Quote and pipeline
                  </h2>
                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <Field label="Pipeline stage">
                      <select value={formState.pipeline_stage} onChange={(event) => setFormState((current) => ({ ...current, pipeline_stage: event.target.value }))} className={inputClassName}>
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
                      <select value={formState.lead_status} onChange={(event) => setFormState((current) => ({ ...current, lead_status: event.target.value }))} className={inputClassName}>
                        <option value="new">New</option>
                        <option value="active">Active</option>
                        <option value="quoted">Quoted</option>
                        <option value="won">Won</option>
                        <option value="lost">Lost</option>
                      </select>
                    </Field>
                    <Field label="Estimated value">
                      <input value={formState.estimated_value} onChange={(event) => setFormState((current) => ({ ...current, estimated_value: event.target.value }))} className={inputClassName} placeholder="15000" />
                    </Field>
                    <Field label="Quote value">
                      <input value={formState.quote_value} onChange={(event) => setFormState((current) => ({ ...current, quote_value: event.target.value }))} className={inputClassName} placeholder="18000" />
                    </Field>
                    <Field label="Quote reference">
                      <input value={formState.quote_reference} onChange={(event) => setFormState((current) => ({ ...current, quote_reference: event.target.value }))} className={inputClassName} placeholder="Q-2026-0041" />
                    </Field>
                    <Field label="Quote status">
                      <select value={formState.quote_status} onChange={(event) => setFormState((current) => ({ ...current, quote_status: event.target.value }))} className={inputClassName}>
                        <option value="draft">Draft</option>
                        <option value="sent">Sent</option>
                        <option value="accepted">Accepted</option>
                        <option value="expired">Expired</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </Field>
                    <Field label="Valid until">
                      <input type="date" value={formState.quote_valid_until} onChange={(event) => setFormState((current) => ({ ...current, quote_valid_until: event.target.value }))} className={inputClassName} />
                    </Field>
                    <Field label="Assigned owner">
                      <select value={formState.assigned_user_id} onChange={(event) => setFormState((current) => ({ ...current, assigned_user_id: event.target.value }))} className={inputClassName} disabled={isLoadingOwners}>
                        <option value="">Unassigned</option>
                        {owners.map((owner) => (
                          <option key={owner.id} value={owner.id}>
                            {owner.full_name || owner.username || owner.id}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                </section>
              </div>

              <div className="space-y-6">
                <section className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-6">
                  <h2 className="text-xl font-semibold tracking-[-0.03em] text-slate-950">
                    Sales summary
                  </h2>
                  <div className="mt-5 space-y-4">
                    <SummaryRow label="Assigned to" value={selectedOwnerLabel} />
                    <SummaryRow label="Estimated value" value={formatCurrency(parseMoney(formState.estimated_value))} />
                    <SummaryRow label="Quote value" value={formatCurrency(parseMoney(formState.quote_value))} />
                    <SummaryRow label="Stage" value={formState.pipeline_stage.replace("_", " ")} />
                    <SummaryRow label="Quote reference" value={formState.quote_reference || "Not set"} />
                  </div>
                </section>

                <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6">
                  <h2 className="text-xl font-semibold tracking-[-0.03em] text-slate-950">
                    Notes
                  </h2>
                  <div className="mt-5">
                    <Field label="Internal notes">
                      <textarea value={formState.notes} onChange={(event) => setFormState((current) => ({ ...current, notes: event.target.value }))} rows={10} className={`${inputClassName} resize-y`} />
                    </Field>
                  </div>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="rounded-full bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                    >
                      {isSaving ? "Saving retail request..." : "Save retail request"}
                    </button>
                    <Link
                      href="/retail"
                      className="rounded-full border border-slate-200 bg-slate-50 px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                    >
                      View dashboard
                    </Link>
                  </div>
                </section>
              </div>
            </form>
          </section>
        </AuthGuard>
      </div>
    </main>
  );
}

function Field({
  children,
  label,
  required = false,
}: {
  children: React.ReactNode;
  label: string;
  required?: boolean;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium text-slate-700">
      <span>
        {label}
        {required ? <span className="ml-1 text-rose-500">*</span> : null}
      </span>
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
