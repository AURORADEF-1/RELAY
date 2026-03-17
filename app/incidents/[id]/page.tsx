"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { NotificationBadge } from "@/components/notification-badge";
import { useNotifications } from "@/components/notification-provider";
import { LogoutButton } from "@/components/logout-button";
import { RelayLogo } from "@/components/relay-logo";
import { WorkshopIncidentsTabs } from "@/components/workshop-incidents-tabs";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import { getSupabaseClient } from "@/lib/supabase";
import {
  getWorkshopIncidentById,
  updateWorkshopIncident,
  workshopIncidentStatuses,
  type WorkshopIncidentRecord,
} from "@/lib/workshop-incidents";

export default function IncidentDetailPage() {
  const { requesterUnreadCount, adminBadgeCount, isAdmin } = useNotifications();
  const params = useParams<{ id: string }>();
  const incidentId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [incident, setIncident] = useState<WorkshopIncidentRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadIncident() {
      const supabase = getSupabaseClient();

      if (!supabase) {
        setErrorMessage("Supabase environment variables are not configured.");
        setIsLoading(false);
        return;
      }

      const { user, isAdmin } = await getCurrentUserWithRole(supabase);

      if (!isMounted || !user) {
        setIsLoading(false);
        return;
      }

      const nextIncident = getWorkshopIncidentById(incidentId, {
        userId: user.id,
        isAdmin,
      });

      setIncident(nextIncident);
      setErrorMessage(nextIncident ? "" : "Incident not found.");
      setIsLoading(false);
    }

    void loadIncident();

    return () => {
      isMounted = false;
    };
  }, [incidentId]);

  function handleStatusChange(nextStatus: string) {
    if (!incident) {
      return;
    }

    const updatedIncident = updateWorkshopIncident(incident.id, {
      status: nextStatus as WorkshopIncidentRecord["status"],
    });

    if (updatedIncident) {
      setIncident(updatedIncident);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#f8fafc_0%,#eef2f7_48%,#e2e8f0_100%)] px-6 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-6xl space-y-8">
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
                Workshop Incident Detail
              </div>
              <h1 className="text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">
                Incident Record
              </h1>
            </div>

            <div className="mt-8">
              <WorkshopIncidentsTabs activeTab="dashboard" />
            </div>

            {errorMessage ? (
              <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {errorMessage}
              </div>
            ) : null}

            {isLoading ? (
              <div className="mt-8 rounded-3xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                Loading incident...
              </div>
            ) : incident ? (
              <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_0.9fr]">
                <section className="rounded-3xl border border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Incident Type
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-slate-950">
                        {incident.incident_type === "TYRE_BREAKDOWN" ? "Tyre Breakdown" : "Damage Report"}
                      </p>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700">
                      {incident.status}
                    </span>
                  </div>

                  <dl className="mt-6 grid gap-5 sm:grid-cols-2">
                    <DetailItem label="Reported By" value={incident.reported_by} />
                    <DetailItem label="Machine" value={incident.machine_reference} />
                    <DetailItem label="Job Number" value={incident.job_number} />
                    <DetailItem label="Severity" value={incident.severity} />
                    <DetailItem label="Location" value={`${incident.location_type} · ${incident.location_summary || "-"}`} />
                    <DetailItem label="Assigned User" value={incident.assigned_to} />
                  </dl>

                  <div className="mt-6 space-y-4">
                    <DetailBlock label="Incident Description" value={incident.description} />
                    <DetailBlock label="Workshop Notes" value={incident.notes} />
                  </div>
                </section>

                <section className="rounded-3xl border border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] p-6">
                  <div className="space-y-2">
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Operational Controls
                    </p>
                    <p className="text-sm leading-6 text-slate-500">
                      Update the incident status while the workshop team works through the breakdown or damage response.
                    </p>
                  </div>

                  <div className="mt-6 grid gap-3">
                    {workshopIncidentStatuses.map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => handleStatusChange(status)}
                        className={`rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${
                          incident.status === status
                            ? "border-slate-950 bg-slate-950 text-white"
                            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                        }`}
                      >
                        {status}
                      </button>
                    ))}
                  </div>

                  <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
                    <p className="font-semibold text-slate-900">Incident-specific data</p>
                    <p className="mt-3">Damage Area: {incident.damage_area || "-"}</p>
                    <p className="mt-2">Tyre Position: {incident.tyre_position || "-"}</p>
                    <p className="mt-2">
                      Vehicle Immobilised: {incident.vehicle_immobilised ? "Yes" : "No"}
                    </p>
                    <p className="mt-2">
                      Replacement Required: {incident.replacement_required ? "Yes" : "No"}
                    </p>
                  </div>
                </section>
              </div>
            ) : null}
          </section>
        </AuthGuard>
      </div>
    </main>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </dt>
      <dd className="mt-2 text-sm leading-7 text-slate-700">{value || "-"}</dd>
    </div>
  );
}

function DetailBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-7 text-slate-600">
        {value || "-"}
      </p>
    </div>
  );
}
