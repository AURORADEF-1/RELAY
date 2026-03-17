"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { NotificationBadge } from "@/components/notification-badge";
import { useNotifications } from "@/components/notification-provider";
import { LogoutButton } from "@/components/logout-button";
import { RelayLogo } from "@/components/relay-logo";
import { WorkshopIncidentsTabs } from "@/components/workshop-incidents-tabs";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import { getSupabaseClient } from "@/lib/supabase";
import {
  getWorkshopIncidents,
  reconcileWorkshopIncidentsWithPartsTickets,
  workshopIncidentStatuses,
  type WorkshopIncidentRecord,
} from "@/lib/workshop-incidents";

export default function IncidentsPage() {
  const { requesterUnreadCount, adminBadgeCount, isAdmin } = useNotifications();
  const [incidents, setIncidents] = useState<WorkshopIncidentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const loadIncidents = useCallback(async () => {
    const supabase = getSupabaseClient();

    if (!supabase) {
      setErrorMessage("Supabase environment variables are not configured.");
      setIsLoading(false);
      return;
    }

    const { user, isAdmin } = await getCurrentUserWithRole(supabase);

    if (!user) {
      setErrorMessage("Sign in to view workshop incidents.");
      setIsLoading(false);
      return;
    }

    const nextIncidents = getWorkshopIncidents({
      userId: user.id,
      isAdmin,
    });
    const incidentJobNumbers = Array.from(
      new Set(
        nextIncidents
          .map((incident) => incident.job_number.trim())
          .filter(Boolean),
      ),
    );

    let reconciledIncidents = nextIncidents;

    if (incidentJobNumbers.length > 0) {
      const { data: linkedTickets } = await supabase
        .from("tickets")
        .select("id, job_number, status")
        .in("job_number", incidentJobNumbers);

      reconciledIncidents = reconcileWorkshopIncidentsWithPartsTickets(
        nextIncidents,
        linkedTickets ?? [],
      );
    }

    setIncidents(reconciledIncidents);
    setErrorMessage("");
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadIncidents();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadIncidents]);

  const groupedCounts = useMemo(
    () =>
      Object.fromEntries(
        workshopIncidentStatuses.map((status) => [
          status,
          incidents.filter((incident) => incident.status === status).length,
        ]),
      ) as Record<string, number>,
    [incidents],
  );

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
            <Link href="/submit" className="rounded-full px-4 py-2 hover:bg-white">
              Submit Ticket
            </Link>
            <Link href="/requests" className="rounded-full px-4 py-2 hover:bg-white">
              My Requests
              <NotificationBadge count={requesterUnreadCount} />
            </Link>
            <Link
              href="/incidents"
              className="rounded-full bg-slate-950 px-4 py-2 text-white hover:bg-slate-800"
            >
              Workshop Incidents
            </Link>
            {isAdmin ? (
              <>
                <Link href="/control" className="rounded-full px-4 py-2 hover:bg-white">
                  Workshop Control
                </Link>
                <Link href="/wallboard" className="rounded-full px-4 py-2 hover:bg-white">
                  Live Wallboard
                </Link>
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
                Workshop Incident Environment
              </div>
              <h1 className="text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">
                Workshop Incidents
              </h1>
              <p className="max-w-3xl text-base leading-8 text-slate-600">
                Separate live environment for machine damage reports and tyre breakdowns without disturbing the current parts workflow.
              </p>
            </div>

            <div className="mt-8">
              <WorkshopIncidentsTabs activeTab="dashboard" />
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
              {workshopIncidentStatuses.map((status) => (
                <div
                  key={status}
                  className="rounded-3xl border border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] px-5 py-4"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {status}
                  </p>
                  <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
                    {groupedCounts[status]}
                  </p>
                </div>
              ))}
            </div>

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
                      <th className="px-6 py-4">Reported</th>
                      <th className="px-6 py-4">Type</th>
                      <th className="px-6 py-4">Job Number</th>
                      <th className="px-6 py-4">Machine</th>
                      <th className="px-6 py-4">Incident</th>
                      <th className="px-6 py-4">Severity</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Handled By</th>
                      <th className="px-6 py-4">Parts Request</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {isLoading ? (
                      <tr>
                        <td colSpan={9} className="px-6 py-10 text-center text-sm text-slate-500">
                          Loading workshop incidents...
                        </td>
                      </tr>
                    ) : incidents.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-6 py-10 text-center text-sm text-slate-500">
                          No workshop incidents reported yet.
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
                              {formatIncidentType(incident.incident_type)}
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
                            {incident.severity}
                          </td>
                          <td className="px-6 py-5 text-sm text-slate-700">
                            {incident.status}
                          </td>
                          <td className="px-6 py-5 text-sm text-slate-700">
                            {incident.assigned_to || "-"}
                          </td>
                          <td className="px-6 py-5 text-sm text-slate-700">
                            {incident.linked_parts_ticket_id ? (
                              <Link
                                href={`/tickets/${incident.linked_parts_ticket_id}`}
                                className="font-semibold text-slate-900 transition hover:text-slate-600"
                              >
                                Open linked request
                              </Link>
                            ) : (
                              "-"
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-4 bg-slate-50 p-4 lg:hidden">
                {incidents.map((incident) => (
                  <article key={incident.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          <Link href={`/incidents/${incident.id}`} className="transition hover:text-slate-600">
                            {formatIncidentType(incident.incident_type)} · {incident.job_number || incident.machine_reference}
                          </Link>
                        </p>
                        <p className="mt-1 text-sm text-slate-500">{incident.machine_reference}</p>
                      </div>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold tracking-[0.14em] text-slate-700">
                        {incident.status}
                      </span>
                    </div>
                    <p className="mt-4 text-sm leading-7 text-slate-600">{incident.description}</p>
                    {incident.linked_parts_ticket_id ? (
                      <Link
                        href={`/tickets/${incident.linked_parts_ticket_id}`}
                        className="mt-4 inline-flex rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                      >
                        Open Linked Parts Request
                      </Link>
                    ) : null}
                  </article>
                ))}
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

function formatIncidentType(value: string) {
  return value === "TYRE_BREAKDOWN" ? "Tyre Breakdown" : "Damage Report";
}
