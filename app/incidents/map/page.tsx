"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { NotificationBadge } from "@/components/notification-badge";
import { useNotifications } from "@/components/notification-provider";
import { LogoutButton } from "@/components/logout-button";
import { RelayLogo } from "@/components/relay-logo";
import { WorkshopIncidentsTabs } from "@/components/workshop-incidents-tabs";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import { getSupabaseClient } from "@/lib/supabase";

type OnsiteTicket = {
  id: string;
  requester_name: string | null;
  department: string | null;
  machine_reference: string | null;
  job_number: string | null;
  request_summary: string | null;
  request_details: string | null;
  status: string | null;
  assigned_to: string | null;
  location_lat: number | null;
  location_lng: number | null;
  location_summary: string | null;
  updated_at: string | null;
};

type LeafletMap = {
  remove: () => void;
  fitBounds: (bounds: unknown, options?: unknown) => void;
};

declare global {
  interface Window {
    L?: {
      map: (element: HTMLElement) => LeafletMap & {
        setView: (coords: [number, number], zoom: number) => void;
      };
      tileLayer: (url: string, options: Record<string, unknown>) => {
        addTo: (map: LeafletMap) => void;
      };
      circleMarker: (
        coords: [number, number],
        options: Record<string, unknown>,
      ) => {
        addTo: (map: LeafletMap) => {
          bindPopup: (html: string) => void;
          openPopup?: () => void;
        };
      };
      latLngBounds: (coords: Array<[number, number]>) => unknown;
    };
  }
}

const LEAFLET_CSS_ID = "relay-leaflet-css";
const LEAFLET_SCRIPT_ID = "relay-leaflet-script";

export default function WorkshopControlMapPage() {
  const { requesterUnreadCount, adminBadgeCount, isAdmin } = useNotifications();
  const [tickets, setTickets] = useState<OnsiteTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<LeafletMap | null>(null);

  const loadTickets = useCallback(async () => {
    try {
      const supabase = getSupabaseClient();

      if (!supabase) {
        setErrorMessage("Supabase environment variables are not configured.");
        setIsLoading(false);
        return;
      }

      const { user, isAdmin } = await getCurrentUserWithRole(supabase);

      if (!user || !isAdmin) {
        setErrorMessage("Admin access is required to view the onsite map.");
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("tickets")
        .select(
          "id, requester_name, department, machine_reference, job_number, request_summary, request_details, status, assigned_to, location_lat, location_lng, location_summary, updated_at",
        )
        .eq("department", "Onsite")
        .neq("status", "COMPLETED")
        .not("location_lat", "is", null)
        .not("location_lng", "is", null)
        .order("updated_at", { ascending: false });

      if (error) {
        throw new Error(error.message);
      }

      setTickets((data ?? []) as OnsiteTicket[]);
      setLastUpdatedAt(new Date().toISOString());
      setErrorMessage("");
      setIsLoading(false);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to load onsite jobs.",
      );
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadTickets();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadTickets]);

  const liveOnsiteJobs = useMemo(
    () =>
      tickets.filter(
        (ticket) =>
          typeof ticket.location_lat === "number" &&
          typeof ticket.location_lng === "number",
      ),
    [tickets],
  );

  useEffect(() => {
    let isCancelled = false;

    async function renderMap() {
      if (!mapRef.current) {
        return;
      }

      await ensureLeafletLoaded();

      if (isCancelled || !mapRef.current || !window.L) {
        return;
      }

      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }

      const L = window.L;
      const map = L.map(mapRef.current);
      leafletMapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);

      if (liveOnsiteJobs.length === 0) {
        map.setView([52.0, 0.12], 7);
        return;
      }

      const bounds = L.latLngBounds(
        liveOnsiteJobs.map((ticket) => [
          ticket.location_lat as number,
          ticket.location_lng as number,
        ]),
      );

      liveOnsiteJobs.forEach((ticket) => {
        const popupHtml = `
          <div style="min-width:220px;color:#0f172a;font-family:Arial,sans-serif;">
            <div style="font-weight:700;font-size:14px;">${escapeHtml(ticket.job_number ? `Job ${ticket.job_number}` : ticket.machine_reference ?? "Onsite job")}</div>
            <div style="margin-top:6px;font-size:12px;color:#475569;">${escapeHtml(ticket.requester_name ?? "Unknown requester")}</div>
            <div style="margin-top:8px;font-size:12px;line-height:1.5;">${escapeHtml(ticket.request_summary ?? ticket.request_details ?? "No request summary provided.")}</div>
            <div style="margin-top:8px;font-size:12px;color:#334155;">Status: <strong>${escapeHtml(ticket.status ?? "-")}</strong></div>
            <div style="margin-top:4px;font-size:12px;color:#334155;">Assigned: <strong>${escapeHtml(ticket.assigned_to ?? "Unassigned")}</strong></div>
            <div style="margin-top:8px;"><a href="/tickets/${ticket.id}" style="font-size:12px;font-weight:700;color:#0f172a;text-decoration:none;">Open ticket</a></div>
          </div>
        `;

        L.circleMarker(
          [ticket.location_lat as number, ticket.location_lng as number],
          {
            radius: 10,
            color: "#0f172a",
            weight: 2,
            fillColor: getMarkerColor(ticket.status),
            fillOpacity: 0.85,
          },
        )
          .addTo(map)
          .bindPopup(popupHtml);
      });

      map.fitBounds(bounds, { padding: [32, 32] });
    }

    void renderMap();

    return () => {
      isCancelled = true;
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, [liveOnsiteJobs]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#0f172a_0%,#111827_45%,#020617_100%)] px-6 py-6 text-slate-100">
      <div className="mx-auto max-w-[120rem] space-y-6">
        <nav className="flex flex-wrap items-center justify-between gap-4 rounded-[1.75rem] border border-white/10 bg-white/5 px-5 py-4 shadow-[0_24px_80px_-40px_rgba(15,23,42,0.8)] backdrop-blur">
          <RelayLogo />
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-300">
            <Link href="/" className="rounded-full px-4 py-2 hover:bg-white/10">
              Home
            </Link>
            <Link href="/legal" className="rounded-full px-4 py-2 hover:bg-white/10">
              Legal
            </Link>
            <Link href="/submit" className="rounded-full px-4 py-2 hover:bg-white/10">
              Submit Ticket
            </Link>
            <Link href="/requests" className="rounded-full px-4 py-2 hover:bg-white/10">
              My Requests
              <NotificationBadge count={requesterUnreadCount} />
            </Link>
            <Link
              href="/incidents"
              className="rounded-full bg-white px-4 py-2 font-semibold text-slate-950"
            >
              Workshop Control
            </Link>
            {isAdmin ? (
              <>
                <Link href="/control" className="rounded-full px-4 py-2 hover:bg-white/10">
                  Admin Control
                </Link>
                <Link href="/admin" className="rounded-full px-4 py-2 hover:bg-white/10">
                  Parts Control
                  <NotificationBadge count={adminBadgeCount} />
                </Link>
              </>
            ) : null}
            <LogoutButton />
          </div>
        </nav>

        <AuthGuard requiredRole="admin">
          <section className="rounded-[2rem] border border-white/10 bg-white/5 p-8 shadow-[0_32px_90px_-48px_rgba(15,23,42,0.85)] backdrop-blur">
            <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
              <div className="space-y-5">
                <div className="inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-300">
                  Onsite Mapping
                </div>
                <div className="space-y-3">
                  <h1 className="text-5xl font-semibold tracking-[-0.05em] text-white sm:text-6xl">
                    Live Onsite Map
                  </h1>
                  <p className="max-w-3xl text-lg leading-8 text-slate-300">
                    Plotting all live onsite jobs with saved geolocation data from RELAY ticket submissions.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <InfoCard label="Live Pins" value={String(liveOnsiteJobs.length)} />
                <InfoCard
                  label="Last Sync"
                  value={lastUpdatedAt ? formatDateTime(lastUpdatedAt) : "Waiting..."}
                />
                <button
                  type="button"
                  onClick={() => void loadTickets()}
                  className="rounded-2xl border border-white/15 bg-white/10 px-5 py-4 text-left transition hover:bg-white/15"
                >
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">
                    Control
                  </p>
                  <p className="mt-2 text-xl font-semibold text-white">
                    Refresh Now
                  </p>
                </button>
              </div>
            </div>

            <div className="mt-8">
              <WorkshopIncidentsTabs activeTab="map" />
            </div>

            {errorMessage ? (
              <div className="mt-6 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {errorMessage}
              </div>
            ) : null}

            <div className="mt-8 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <section className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/5">
                <div ref={mapRef} className="h-[38rem] w-full" />
              </section>

              <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">
                    Live Onsite Jobs
                  </p>
                  <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-sm font-semibold text-white">
                    {liveOnsiteJobs.length}
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  {isLoading ? (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 p-4 text-sm text-slate-400">
                      Loading onsite jobs...
                    </div>
                  ) : liveOnsiteJobs.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 p-4 text-sm text-slate-400">
                      No live onsite jobs with geolocation are currently available.
                    </div>
                  ) : (
                    liveOnsiteJobs.map((ticket) => (
                      <Link
                        key={ticket.id}
                        href={`/tickets/${ticket.id}`}
                        className="block rounded-2xl border border-white/10 bg-black/15 p-4 transition hover:border-white/20 hover:bg-black/25"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-lg font-semibold text-white">
                              {ticket.job_number ? `Job ${ticket.job_number}` : ticket.machine_reference ?? "Onsite job"}
                            </p>
                            <p className="mt-1 truncate text-sm text-slate-300">
                              {ticket.requester_name ?? "Unknown requester"}
                            </p>
                          </div>
                          <span className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-200">
                            {ticket.status ?? "-"}
                          </span>
                        </div>

                        <p className="mt-4 line-clamp-3 text-sm leading-6 text-slate-200">
                          {ticket.request_summary ?? ticket.request_details ?? "No request summary provided."}
                        </p>

                        <dl className="mt-4 grid gap-2 text-xs text-slate-400">
                          <div className="flex items-center justify-between gap-3">
                            <dt>Machine</dt>
                            <dd className="truncate text-right text-slate-200">
                              {ticket.machine_reference ?? "-"}
                            </dd>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <dt>Location</dt>
                            <dd className="truncate text-right text-slate-200">
                              {ticket.location_summary ?? formatCoordinates(ticket)}
                            </dd>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <dt>Assigned</dt>
                            <dd className="truncate text-right text-slate-200">
                              {ticket.assigned_to ?? "Unassigned"}
                            </dd>
                          </div>
                        </dl>
                      </Link>
                    ))
                  )}
                </div>
              </section>
            </div>
          </section>
        </AuthGuard>
      </div>
    </main>
  );
}

async function ensureLeafletLoaded() {
  if (!document.getElementById(LEAFLET_CSS_ID)) {
    const link = document.createElement("link");
    link.id = LEAFLET_CSS_ID;
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);
  }

  if (window.L) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const existingScript = document.getElementById(
      LEAFLET_SCRIPT_ID,
    ) as HTMLScriptElement | null;

    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener(
        "error",
        () => reject(new Error("Unable to load Leaflet.")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.id = LEAFLET_SCRIPT_ID;
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Unable to load Leaflet."));
    document.body.appendChild(script);
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getMarkerColor(status: string | null) {
  switch (status) {
    case "PENDING":
      return "#f97316";
    case "QUERY":
      return "#f59e0b";
    case "IN_PROGRESS":
      return "#3b82f6";
    case "ORDERED":
      return "#0ea5e9";
    case "READY":
      return "#22c55e";
    case "ESTIMATE":
    case "QUOTE":
      return "#a855f7";
    default:
      return "#94a3b8";
  }
}

function formatCoordinates(ticket: OnsiteTicket) {
  if (
    typeof ticket.location_lat === "number" &&
    typeof ticket.location_lng === "number"
  ) {
    return `${ticket.location_lat.toFixed(5)}, ${ticket.location_lng.toFixed(5)}`;
  }

  return "-";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">
        {label}
      </p>
      <p className="mt-2 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}
