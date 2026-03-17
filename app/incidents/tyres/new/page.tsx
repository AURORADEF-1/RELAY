"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { FileUploadPanel } from "@/components/file-upload-panel";
import { NotificationBadge } from "@/components/notification-badge";
import { useNotifications } from "@/components/notification-provider";
import { LogoutButton } from "@/components/logout-button";
import { RelayLogo } from "@/components/relay-logo";
import { WorkshopIncidentsTabs } from "@/components/workshop-incidents-tabs";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import { getSupabaseClient } from "@/lib/supabase";
import {
  createWorkshopIncident,
  uploadWorkshopIncidentAttachments,
  workshopIncidentSeverities,
} from "@/lib/workshop-incidents";

export default function NewTyreIncidentPage() {
  const router = useRouter();
  const { requesterUnreadCount, adminBadgeCount, isAdmin } = useNotifications();
  const [formState, setFormState] = useState({
    reported_by: "",
    machine_reference: "",
    job_number: "",
    location_type: "Onsite",
    location_summary: "",
    description: "",
    severity: "HIGH",
    assigned_to: "",
    notes: "",
    po_number: "",
    tyre_position: "",
    vehicle_immobilised: true,
    replacement_required: true,
  });
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    const supabase = getSupabaseClient();

    if (!supabase) {
      setErrorMessage("Supabase environment variables are not configured.");
      setIsSubmitting(false);
      return;
    }

    const { user } = await getCurrentUserWithRole(supabase);

    if (!user) {
      setErrorMessage("Sign in to report workshop incidents.");
      setIsSubmitting(false);
      return;
    }

    try {
      const incident = await createWorkshopIncident(supabase, {
        user_id: user.id,
        reported_by: formState.reported_by.trim() || user.email || "Workshop Reporter",
        incident_type: "TYRE_BREAKDOWN",
        machine_reference: formState.machine_reference.trim(),
        job_number: formState.job_number.trim(),
        location_type: formState.location_type as "Onsite" | "Yard",
        location_summary: formState.location_summary.trim(),
        description: formState.description.trim(),
        severity: formState.severity as (typeof workshopIncidentSeverities)[number],
        assigned_to: formState.assigned_to.trim(),
        notes: formState.notes.trim(),
        po_number: formState.po_number.trim(),
        tyre_position: formState.tyre_position.trim(),
        vehicle_immobilised: formState.vehicle_immobilised,
        replacement_required: formState.replacement_required,
      });

      if (selectedFiles.length > 0) {
        await uploadWorkshopIncidentAttachments({
          supabase,
          incidentId: incident.id,
          userId: user.id,
          files: selectedFiles,
        });
      }

      router.push(`/incidents/${incident.id}`);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to create tyre breakdown.",
      );
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#f8fafc_0%,#eef2f7_48%,#e2e8f0_100%)] px-6 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-5xl space-y-8">
        <nav className="flex flex-wrap items-center justify-between gap-4 rounded-[1.75rem] border border-white/70 bg-white/80 px-5 py-4 shadow-[0_18px_55px_-34px_rgba(15,23,42,0.35)] backdrop-blur">
          <RelayLogo />
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-600">
            <Link href="/" className="rounded-full px-4 py-2 hover:bg-white">Home</Link>
            <Link href="/legal" className="rounded-full px-4 py-2 hover:bg-white">Legal</Link>
            <Link href="/requests" className="rounded-full px-4 py-2 hover:bg-white">
              My Requests
              <NotificationBadge count={requesterUnreadCount} />
            </Link>
            {isAdmin ? (
              <>
                <Link href="/incidents" className="rounded-full bg-slate-950 px-4 py-2 text-white hover:bg-slate-800">
                  Workshop Incidents
                </Link>
                <Link href="/control" className="rounded-full px-4 py-2 hover:bg-white">Workshop Control</Link>
                <Link href="/wallboard" className="rounded-full px-4 py-2 hover:bg-white">Live Wallboard</Link>
                <Link href="/admin" className="rounded-full px-4 py-2 hover:bg-white">
                  Parts Control
                  <NotificationBadge count={adminBadgeCount} />
                </Link>
              </>
            ) : null}
            <LogoutButton />
          </div>
        </nav>

        <AuthGuard requiredRole="admin">
          <section className="rounded-[2rem] border border-white/80 bg-white/90 p-8 shadow-[0_28px_80px_-32px_rgba(15,23,42,0.35)] backdrop-blur sm:p-10">
            <div className="space-y-5">
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-600">
                Tyre Breakdown Intake
              </div>
              <h1 className="text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">
                Report Tyre Breakdown
              </h1>
              <p className="max-w-3xl text-base leading-8 text-slate-600">
                Capture tyre incidents, roadside failures, and workshop breakdowns in a separate operational stream.
              </p>
            </div>

            <div className="mt-8">
              <WorkshopIncidentsTabs activeTab="tyres" />
            </div>

            {errorMessage ? (
              <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {errorMessage}
              </div>
            ) : null}

            <form onSubmit={handleSubmit} className="mt-8 grid gap-6 lg:grid-cols-2">
              <Field label="Reported By" value={formState.reported_by} onChange={(value) => setFormState((current) => ({ ...current, reported_by: value }))} />
              <Field label="Machine Reference" value={formState.machine_reference} onChange={(value) => setFormState((current) => ({ ...current, machine_reference: value }))} />
              <Field label="Job Number" value={formState.job_number} onChange={(value) => setFormState((current) => ({ ...current, job_number: value }))} />
              <Field label="Tyre Position" value={formState.tyre_position} onChange={(value) => setFormState((current) => ({ ...current, tyre_position: value }))} />
              <SelectField label="Location Type" value={formState.location_type} options={["Onsite", "Yard"]} onChange={(value) => setFormState((current) => ({ ...current, location_type: value }))} />
              <Field label="Location Summary" value={formState.location_summary} onChange={(value) => setFormState((current) => ({ ...current, location_summary: value }))} />
              <SelectField label="Severity" value={formState.severity} options={[...workshopIncidentSeverities]} onChange={(value) => setFormState((current) => ({ ...current, severity: value }))} />
              <Field label="Assigned User" value={formState.assigned_to} onChange={(value) => setFormState((current) => ({ ...current, assigned_to: value }))} />
              <Field label="PO Number" value={formState.po_number} onChange={(value) => setFormState((current) => ({ ...current, po_number: value }))} />
              <ToggleField label="Vehicle Immobilised" checked={formState.vehicle_immobilised} onChange={(checked) => setFormState((current) => ({ ...current, vehicle_immobilised: checked }))} />
              <ToggleField label="Replacement Required" checked={formState.replacement_required} onChange={(checked) => setFormState((current) => ({ ...current, replacement_required: checked }))} />
              <AreaField label="Breakdown Description" value={formState.description} onChange={(value) => setFormState((current) => ({ ...current, description: value }))} />
              <AreaField label="Workshop Notes" value={formState.notes} onChange={(value) => setFormState((current) => ({ ...current, notes: value }))} />
              <div className="lg:col-span-2">
                <FileUploadPanel
                  inputId="tyre-incident-photos"
                  label="Breakdown photos"
                  helperText="Upload up to 5 photos. Previews stay compact to reduce browser memory pressure."
                  buttonLabel="Add breakdown photos"
                  emptyText="No breakdown photos selected."
                  maxFiles={5}
                  onFilesChange={setSelectedFiles}
                />
              </div>

              <div className="lg:col-span-2 flex justify-end">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex h-12 items-center justify-center rounded-xl bg-slate-950 px-6 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? "Saving..." : "Create Tyre Breakdown"}
                </button>
              </div>
            </form>
          </section>
        </AuthGuard>
      </div>
    </main>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-slate-400" />
    </label>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-slate-400">
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-5 w-5 rounded border-slate-300" />
    </label>
  );
}

function AreaField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="space-y-2 lg:col-span-1">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={5} className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm leading-7 text-slate-900 outline-none transition focus:border-slate-400" />
    </label>
  );
}
