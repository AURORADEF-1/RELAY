"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { NotificationBadge } from "@/components/notification-badge";
import { useNotifications } from "@/components/notification-provider";
import { LogoutButton } from "@/components/logout-button";
import { RelayLogo } from "@/components/relay-logo";
import { WorkshopIncidentsTabs } from "@/components/workshop-incidents-tabs";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import { getSupabaseClient } from "@/lib/supabase";
import {
  listWorkshopIncidents,
  updateWorkshopIncident,
  type WorkshopIncidentRecord,
} from "@/lib/workshop-incidents";

export default function ClosedIncidentsPage() {
  const { requesterUnreadCount, adminBadgeCount, isAdmin } = useNotifications();
  const [incidents, setIncidents] = useState<WorkshopIncidentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [workingIncidentId, setWorkingIncidentId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const loadIncidents = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const supabase = getSupabaseClient();

      if (!supabase) {
        setErrorMessage("Supabase environment variables are not configured.");
        setIsLoading(false);
        return;
      }

      const { user, isAdmin } = await getCurrentUserWithRole(supabase);

      if (!user || !isAdmin) {
        setErrorMessage("Admin access is required to view closed incidents.");
        setIsLoading(false);
        return;
      }

      const data = await listWorkshopIncidents(supabase, {
        userId: user.id,
        isAdmin,
        scope: "closed",
      });

      setIncidents(data);
      setIsLoading(false);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to load closed incidents.",
      );
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadIncidents();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadIncidents]);

  async function handleReopenIncident(incident: WorkshopIncidentRecord) {
    const supabase = getSupabaseClient();

    if (!supabase) {
      setNotice({
        type: "error",
        message: "Supabase environment variables are not configured.",
      });
      return;
    }

    setWorkingIncidentId(incident.id);
    setNotice(null);

    try {
      await updateWorkshopIncident(supabase, incident.id, {
        status: "REPORTED",
      });

      setIncidents((current) =>
        current.filter((currentIncident) => currentIncident.id !== incident.id),
      );
      setNotice({
        type: "success",
        message: `Closed incident ${incident.job_number || incident.machine_reference} reopened.`,
      });
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error instanceof Error ? error.message : "Unable to reopen incident.",
      });
    } finally {
      setWorkingIncidentId(null);
    }
  }

  async function handleDeleteIncident(incident: WorkshopIncidentRecord) {
    const confirmed = window.confirm(
      `Permanently delete closed incident ${incident.job_number || incident.machine_reference}? This cannot be undone.`,
    );

    if (!confirmed) {
      return;
    }

    const supabase = getSupabaseClient();

    if (!supabase) {
      setNotice({
        type: "error",
        message: "Supabase environment variables are not configured.",
      });
      return;
    }

    setWorkingIncidentId(incident.id);
    setNotice(null);

    const { error } = await supabase
      .from("workshop_incidents")
      .delete()
      .eq("id", incident.id);

    if (error) {
      setNotice({
        type: "error",
        message: error.message,
      });
      setWorkingIncidentId(null);
      return;
    }

    setIncidents((current) =>
      current.filter((currentIncident) => currentIncident.id !== incident.id),
    );
    setNotice({
      type: "success",
      message: `Closed incident ${incident.job_number || incident.machine_reference} deleted.`,
    });
    setWorkingIncidentId(null);
  }

  function handleExportIncidents() {
    if (incidents.length === 0) {
      setNotice({
        type: "error",
        message: "There are no closed incidents to export.",
      });
      return;
    }

    const csvRows = [
      [
        "closed_at",
        "incident_type",
        "job_number",
        "machine_reference",
        "reported_by",
        "description",
        "severity",
        "handled_by",
      ],
      ...incidents.map((incident) => [
        incident.updated_at,
        incident.incident_type,
        incident.job_number,
        incident.machine_reference,
        incident.reported_by,
        incident.description,
        incident.severity,
        incident.assigned_to,
      ]),
    ];

    const csvContent = csvRows
      .map((row) =>
        row
          .map((value) => `"${String(value ?? "").replaceAll("\"", "\"\"")}"`)
          .join(","),
      )
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const downloadUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = `relay-closed-incidents-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(downloadUrl);

    setNotice({
      type: "success",
      message: `Exported ${incidents.length} closed incident${incidents.length === 1 ? "" : "s"}.`,
    });
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#f8fafc_0%,#eef2f7_48%,#e2e8f0_100%)] px-6 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <nav className="flex flex-wrap items-center justify-between gap-4 rounded-[1.75rem] border border-white/70 bg-white/80 px-5 py-4 shadow-[0_18px_55px_-34px_rgba(15,23,42,0.35)] backdrop-blur">
          <RelayLogo />
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-600">
            <Link href="/" className="rounded-full px-4 py-2 hover:bg-white">Home</Link>
            <Link href="/legal" className="rounded-full px-4 py-2 hover:bg-white">Legal</Link>
            <Link href="/submit" className="rounded-full px-4 py-2 hover:bg-white">Submit Ticket</Link>
            <Link href="/requests" className="rounded-full px-4 py-2 hover:bg-white">
              My Requests
              <NotificationBadge count={requesterUnreadCount} />
            </Link>
            <Link href="/incidents" className="rounded-full bg-slate-950 px-4 py-2 text-white hover:bg-slate-800">
              Workshop Control
            </Link>
            {isAdmin ? (
              <>
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
                Archive
              </div>
              <h1 className="text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">
                Closed Incident Jobs
              </h1>
              <p className="max-w-3xl text-base leading-8 text-slate-600">
                Closed damage reports and tyre breakdowns are archived here, newest first, so the live incident board stays focused on open work.
              </p>
            </div>

            <div className="mt-8">
              <WorkshopIncidentsTabs activeTab="closed" />
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={handleExportIncidents}
                disabled={isLoading || incidents.length === 0}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Export CSV
              </button>
              <button
                type="button"
                onClick={() => void loadIncidents()}
                disabled={isLoading}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? "Refreshing..." : "Refresh"}
              </button>
            </div>

            {notice ? (
              <div
                className={`mt-6 rounded-2xl px-4 py-3 text-sm ${
                  notice.type === "success"
                    ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border border-rose-200 bg-rose-50 text-rose-700"
                }`}
              >
                {notice.message}
              </div>
            ) : null}

            {errorMessage ? (
              <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {errorMessage}
              </div>
            ) : null}

            <div className="mt-8 overflow-hidden rounded-3xl border border-slate-200 shadow-[0_18px_50px_-40px_rgba(15,23,42,0.4)]">
              <div className="hidden overflow-x-auto lg:block">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      <th className="px-6 py-4">Closed</th>
                      <th className="px-6 py-4">Type</th>
                      <th className="px-6 py-4">Job Number</th>
                      <th className="px-6 py-4">Machine</th>
                      <th className="px-6 py-4">Incident</th>
                      <th className="px-6 py-4">Handled By</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {isLoading ? (
                      <tr>
                        <td colSpan={8} className="px-6 py-10 text-center text-sm text-slate-500">
                          Loading closed incidents...
                        </td>
                      </tr>
                    ) : incidents.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-6 py-10 text-center text-sm text-slate-500">
                          No closed incidents found.
                        </td>
                      </tr>
                    ) : (
                      incidents.map((incident) => (
                        <tr key={incident.id}>
                          <td className="px-6 py-5 text-sm text-slate-500">
                            {formatDate(incident.updated_at)}
                          </td>
                          <td className="px-6 py-5 text-sm font-semibold text-slate-900">
                            <Link href={`/incidents/${incident.id}`} className="transition hover:text-slate-600">
                              {incident.incident_type === "TYRE_BREAKDOWN" ? "Tyre Breakdown" : "Damage Report"}
                            </Link>
                          </td>
                          <td className="px-6 py-5 text-sm text-slate-700">
                            {incident.job_number || "-"}
                          </td>
                          <td className="px-6 py-5 text-sm text-slate-700">
                            {incident.machine_reference}
                          </td>
                          <td className="px-6 py-5 text-sm leading-7 text-slate-600">
                            {incident.description}
                          </td>
                          <td className="px-6 py-5 text-sm text-slate-700">
                            {incident.assigned_to || "-"}
                          </td>
                          <td className="px-6 py-5 text-sm text-slate-700">
                            CLOSED
                          </td>
                          <td className="px-6 py-5">
                            <div className="flex justify-end gap-3">
                              <button
                                type="button"
                                onClick={() => void handleReopenIncident(incident)}
                                disabled={workingIncidentId === incident.id}
                                className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Re-open
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteIncident(incident)}
                                disabled={workingIncidentId === incident.id}
                                className="inline-flex h-10 items-center justify-center rounded-xl border border-rose-300 bg-white px-3 text-sm font-semibold text-rose-700 transition hover:border-rose-400 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </AuthGuard>
      </div>
    </main>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
