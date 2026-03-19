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
import { sanitizeUserFacingError } from "@/lib/security";
import { getSupabaseClient } from "@/lib/supabase";
import {
  fetchWorkshopIncidentAttachments,
  getWorkshopIncidentById,
  reconcileWorkshopIncidentsWithPartsTickets,
  updateWorkshopIncident,
  type WorkshopIncidentAttachmentRecord,
  workshopIncidentStatuses,
  type WorkshopIncidentRecord,
} from "@/lib/workshop-incidents";

export default function IncidentDetailPage() {
  const { requesterUnreadCount, adminBadgeCount, isAdmin } = useNotifications();
  const params = useParams<{ id: string }>();
  const incidentId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [incident, setIncident] = useState<WorkshopIncidentRecord | null>(null);
  const [attachments, setAttachments] = useState<WorkshopIncidentAttachmentRecord[]>([]);
  const [linkedPartsTicketStatus, setLinkedPartsTicketStatus] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadIncident() {
      try {
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

        const nextIncident = await getWorkshopIncidentById(supabase, incidentId, {
          userId: user.id,
          isAdmin,
        });

        if (!nextIncident) {
          setIncident(null);
          setAttachments([]);
          setLinkedPartsTicketStatus("");
          setErrorMessage("Incident not found.");
          setIsLoading(false);
          return;
        }

        let resolvedIncident = nextIncident;

        if (nextIncident.job_number.trim()) {
          const { data: linkedTickets } = await supabase
            .from("tickets")
            .select("id, job_number, status")
            .eq("job_number", nextIncident.job_number.trim());

          const reconciledIncidents = reconcileWorkshopIncidentsWithPartsTickets(
            [nextIncident],
            linkedTickets ?? [],
          );
          resolvedIncident = reconciledIncidents[0] ?? nextIncident;

          if (
            resolvedIncident.linked_parts_ticket_id !== nextIncident.linked_parts_ticket_id ||
            resolvedIncident.status !== nextIncident.status
          ) {
            resolvedIncident = await updateWorkshopIncident(supabase, resolvedIncident.id, {
              linked_parts_ticket_id: resolvedIncident.linked_parts_ticket_id,
              status: resolvedIncident.status,
            });
          }

          const matchingTicket =
            (linkedTickets ?? []).find(
              (ticket) =>
                ticket.job_number?.trim().toLowerCase() ===
                nextIncident.job_number.trim().toLowerCase(),
            ) ?? null;

          setLinkedPartsTicketStatus(matchingTicket?.status ?? "");
        } else {
          setLinkedPartsTicketStatus("");
        }

        const nextAttachments = await fetchWorkshopIncidentAttachments(
          supabase,
          nextIncident.id,
        );

        setIncident(resolvedIncident);
        setAttachments(nextAttachments);
        setErrorMessage("");
        setIsLoading(false);
      } catch (error) {
        setErrorMessage(
          sanitizeUserFacingError(error, "Unable to load incident."),
        );
        setIsLoading(false);
      }
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

    if (!isAdmin) {
      setErrorMessage("Admin access is required for this action.");
      return;
    }

    const supabase = getSupabaseClient();

    if (!supabase) {
      return;
    }

    void updateWorkshopIncident(supabase, incident.id, {
      status: nextStatus as WorkshopIncidentRecord["status"],
    }).then((updatedIncident) => {
      setIncident(updatedIncident);
    }).catch((error) => {
      setErrorMessage(
        sanitizeUserFacingError(error, "Unable to update incident status."),
      );
    });
  }

  function handlePrepareTyreCompanyEmail() {
    if (!incident || incident.incident_type !== "TYRE_BREAKDOWN") {
      return;
    }

    const subject = encodeURIComponent(
      `Tyre Breakdown Report${incident.job_number ? ` - Job ${incident.job_number}` : ""}`,
    );
    const body = encodeURIComponent(buildTyreCompanyEmailBody(incident));
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }

  function handleGenerateTyrePdf() {
    if (!incident || incident.incident_type !== "TYRE_BREAKDOWN") {
      return;
    }

    const printWindow = window.open("", "_blank", "width=900,height=1100");

    if (!printWindow) {
      return;
    }

    printWindow.document.write(buildTyreCompanyPrintHtml(incident));
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => {
      printWindow.print();
    }, 250);
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
                  Workshop Control
                </Link>
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

                  {incident.linked_parts_ticket_id ? (
                    <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                        Linked Parts Request
                      </p>
                      <p className="mt-3 text-sm leading-7 text-emerald-900">
                        This incident is linked to the parts request for job number{" "}
                        <span className="font-semibold">{incident.job_number || "-"}</span>.
                        {linkedPartsTicketStatus ? (
                          <>
                            {" "}
                            Current parts status:{" "}
                            <span className="font-semibold">{linkedPartsTicketStatus}</span>.
                          </>
                        ) : null}
                      </p>
                      <Link
                        href={`/tickets/${incident.linked_parts_ticket_id}`}
                        className="mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-600"
                      >
                        Open linked parts request
                      </Link>
                    </div>
                  ) : null}

                  {incident.incident_type === "TYRE_BREAKDOWN" ? (
                    <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Tyre Company Output
                      </p>
                      <p className="mt-3 text-sm leading-7 text-slate-600">
                        PO Number: <span className="font-semibold text-slate-900">{incident.po_number || "-"}</span>
                      </p>
                      <div className="mt-4 flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={handlePrepareTyreCompanyEmail}
                          className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 bg-slate-50 px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-white"
                        >
                          Prepare Email
                        </button>
                        <button
                          type="button"
                          onClick={handleGenerateTyrePdf}
                          className="inline-flex h-11 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
                        >
                          Generate PDF
                        </button>
                      </div>
                      <p className="mt-3 text-xs text-slate-500">
                        PDF generation opens the print dialog so the report can be saved as a PDF and attached to the tyre company email.
                      </p>
                    </div>
                  ) : null}

                  <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Incident Photos
                    </p>
                    {attachments.length === 0 ? (
                      <p className="mt-3 text-sm text-slate-500">
                        No incident photos uploaded yet.
                      </p>
                    ) : (
                      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                        {attachments.map((attachment) => (
                          <a
                            key={attachment.id}
                            href={attachment.signed_url ?? undefined}
                            target="_blank"
                            rel="noreferrer"
                            className="group overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"
                          >
                            {attachment.signed_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={attachment.signed_url}
                                alt={attachment.file_name || "Incident attachment"}
                                className="h-24 w-full object-cover transition group-hover:scale-[1.02]"
                              />
                            ) : (
                              <div className="flex h-24 items-center justify-center px-3 text-center text-xs text-slate-500">
                                Preview unavailable
                              </div>
                            )}
                            <div className="p-2">
                              <p className="truncate text-xs font-semibold text-slate-700">
                                {attachment.file_name || "Incident photo"}
                              </p>
                            </div>
                          </a>
                        ))}
                      </div>
                    )}
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
                    <p className="mt-2">PO Number: {incident.po_number || "-"}</p>
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

function buildTyreCompanyEmailBody(incident: WorkshopIncidentRecord) {
  return [
    "Please find below the tyre breakdown report.",
    "",
    `PO Number: ${incident.po_number || "Not yet assigned"}`,
    `Job Number: ${incident.job_number || "-"}`,
    `Machine Reference: ${incident.machine_reference}`,
    `Reported By: ${incident.reported_by}`,
    `Location: ${incident.location_type} ${incident.location_summary ? `- ${incident.location_summary}` : ""}`,
    `Tyre Position: ${incident.tyre_position || "-"}`,
    `Vehicle Immobilised: ${incident.vehicle_immobilised ? "Yes" : "No"}`,
    `Replacement Required: ${incident.replacement_required ? "Yes" : "No"}`,
    `Severity: ${incident.severity}`,
    "",
    "Breakdown Description:",
    incident.description || "-",
    "",
    "Workshop Notes:",
    incident.notes || "-",
  ].join("\n");
}

function buildTyreCompanyPrintHtml(incident: WorkshopIncidentRecord) {
  const escapeHtml = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Tyre Breakdown Report</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 32px; color: #0f172a; }
      h1 { margin: 0 0 12px; font-size: 28px; }
      h2 { margin: 24px 0 8px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.12em; color: #475569; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 24px; }
      .card { border: 1px solid #cbd5e1; border-radius: 16px; padding: 20px; }
      p { margin: 0; line-height: 1.6; }
      .value { font-weight: 600; color: #020617; }
      .block { white-space: pre-wrap; }
    </style>
  </head>
  <body>
    <h1>Tyre Breakdown Report</h1>
    <p>Prepared from RELAY workshop incidents.</p>
    <div class="card" style="margin-top: 24px;">
      <div class="grid">
        <p><strong>PO Number</strong><br><span class="value">${escapeHtml(incident.po_number || "-")}</span></p>
        <p><strong>Job Number</strong><br><span class="value">${escapeHtml(incident.job_number || "-")}</span></p>
        <p><strong>Machine Reference</strong><br><span class="value">${escapeHtml(incident.machine_reference)}</span></p>
        <p><strong>Reported By</strong><br><span class="value">${escapeHtml(incident.reported_by)}</span></p>
        <p><strong>Location</strong><br><span class="value">${escapeHtml(`${incident.location_type}${incident.location_summary ? ` - ${incident.location_summary}` : ""}`)}</span></p>
        <p><strong>Tyre Position</strong><br><span class="value">${escapeHtml(incident.tyre_position || "-")}</span></p>
        <p><strong>Vehicle Immobilised</strong><br><span class="value">${incident.vehicle_immobilised ? "Yes" : "No"}</span></p>
        <p><strong>Replacement Required</strong><br><span class="value">${incident.replacement_required ? "Yes" : "No"}</span></p>
        <p><strong>Severity</strong><br><span class="value">${escapeHtml(incident.severity)}</span></p>
        <p><strong>Status</strong><br><span class="value">${escapeHtml(incident.status)}</span></p>
      </div>
      <h2>Breakdown Description</h2>
      <p class="block">${escapeHtml(incident.description || "-")}</p>
      <h2>Workshop Notes</h2>
      <p class="block">${escapeHtml(incident.notes || "-")}</p>
    </div>
  </body>
</html>`;
}
