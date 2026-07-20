"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { ConsoleIcon } from "@/components/console/console-icon";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
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

type LeafletMarker = {
  bindPopup: (html: string) => LeafletMarker;
  openPopup: () => void;
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
        addTo: (map: LeafletMap) => LeafletMarker;
      };
      latLngBounds: (coords: Array<[number, number]>) => unknown;
    };
  }
}

const LEAFLET_CSS_ID = "relay-leaflet-css";
const LEAFLET_SCRIPT_ID = "relay-leaflet-script";
const ONSITE_MAP_REFRESH_INTERVAL_MS = 30000;

export default function WorkshopControlMapPage() {
  const [tickets, setTickets] = useState<OnsiteTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<LeafletMap | null>(null);
  const markerRefs = useRef(new Map<string, LeafletMarker>());

  const loadTickets = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    try {
      if (silent) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      const supabase = getSupabaseClient();

      if (!supabase) {
        setErrorMessage("Supabase environment variables are not configured.");
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      const { user, isAdmin } = await getCurrentUserWithRole(supabase);

      if (!user || !isAdmin) {
        setErrorMessage("Admin access is required to view the onsite map.");
        setIsLoading(false);
        setIsRefreshing(false);
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
      setIsRefreshing(false);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to load onsite jobs.",
      );
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadTickets();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadTickets]);

  useEffect(() => {
    const supabase = getSupabaseClient();

    if (!supabase) {
      return;
    }

    const refreshTickets = () => {
      if (document.visibilityState === "hidden") {
        return;
      }

      void loadTickets({ silent: true });
    };

    const refreshIntervalId = window.setInterval(
      refreshTickets,
      ONSITE_MAP_REFRESH_INTERVAL_MS,
    );

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshTickets();
      }
    };

    window.addEventListener("focus", refreshTickets);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const channel = supabase
      .channel("onsite-map-tickets")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tickets",
        },
        () => {
          refreshTickets();
        },
      )
      .subscribe();

    return () => {
      window.clearInterval(refreshIntervalId);
      window.removeEventListener("focus", refreshTickets);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void supabase.removeChannel(channel);
    };
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
      markerRefs.current.clear();

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

        const marker = L.circleMarker(
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
        markerRefs.current.set(ticket.id, marker);
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
    <div className="workshop-legacy-page workshop-map-page">
      <div>
        <AuthGuard requiredRole="admin">
          <section>
            <PageHeader
              title="Live Onsite Map"
              description="Track every active onsite job with saved geolocation data and open the linked request directly from its marker."
              meta={
                <>
                  <span className="relay-live-label"><i /> {liveOnsiteJobs.length} live pin{liveOnsiteJobs.length === 1 ? "" : "s"}</span>
                  <span>Last sync {lastUpdatedAt ? formatDateTime(lastUpdatedAt) : "waiting"}</span>
                </>
              }
              actions={
                <button type="button" onClick={() => void loadTickets({ silent: true })} disabled={isRefreshing} className="relay-button relay-button-primary">
                  <ConsoleIcon name="refresh" className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                  {isRefreshing ? "Refreshing" : "Refresh map"}
                </button>
              }
            />

            {errorMessage ? (
              <div className="mt-6 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {errorMessage}
              </div>
            ) : null}

            <div className="workshop-map-grid">
              <section className="workshop-map-canvas" aria-label="Live onsite job map">
                <div ref={mapRef} />
              </section>

              <section className="workshop-map-jobs">
                <div className="workshop-map-jobs-header">
                  <h2>
                    Live Onsite Jobs
                  </h2>
                  <span className="relay-count-badge">
                    {liveOnsiteJobs.length}
                  </span>
                </div>

                <div className="workshop-map-job-list">
                  {isLoading ? (
                    <EmptyState title="Loading onsite jobs" description="Synchronising live locations." />
                  ) : liveOnsiteJobs.length === 0 ? (
                    <EmptyState title="No geolocated onsite jobs" description="Jobs appear here when an active onsite request has a confirmed location." />
                  ) : (
                    liveOnsiteJobs.map((ticket) => (
                      <article key={ticket.id} className={`workshop-map-job ${selectedTicketId === ticket.id ? "workshop-map-job-selected" : ""}`}>
                        <button type="button" onClick={() => { setSelectedTicketId(ticket.id); markerRefs.current.get(ticket.id)?.openPopup(); }} className="workshop-map-job-focus">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-base font-semibold text-[color:var(--foreground-strong)]">
                              {ticket.job_number ? `Job ${ticket.job_number}` : ticket.machine_reference ?? "Onsite job"}
                            </p>
                            <p className="mt-1 truncate text-sm text-[color:var(--foreground-muted)]">
                              {ticket.requester_name ?? "Unknown requester"}
                            </p>
                          </div>
                          <span className="relay-status-badge">
                            {ticket.status ?? "-"}
                          </span>
                        </div>

                        <p className="mt-3 line-clamp-2 text-sm leading-6 text-[color:var(--foreground)]">
                          {ticket.request_summary ?? ticket.request_details ?? "No request summary provided."}
                        </p>

                        <dl className="workshop-map-job-details">
                          <div className="flex items-center justify-between gap-3">
                            <dt>Machine</dt>
                            <dd>
                              {ticket.machine_reference ?? "-"}
                            </dd>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <dt>Location</dt>
                            <dd>
                              {ticket.location_summary ?? formatCoordinates(ticket)}
                            </dd>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <dt>Assigned</dt>
                            <dd>
                              {ticket.assigned_to ?? "Unassigned"}
                            </dd>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <dt>Updated</dt>
                            <dd>{ticket.updated_at ? formatDateTime(ticket.updated_at) : "-"}</dd>
                          </div>
                        </dl>
                        </button>
                        <Link href={`/tickets/${ticket.id}`} className="relay-inline-link workshop-map-open-ticket">Open ticket</Link>
                      </article>
                    ))
                  )}
                </div>
              </section>
            </div>
          </section>
        </AuthGuard>
      </div>
    </div>
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
