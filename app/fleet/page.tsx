"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { ConsoleIcon } from "@/components/console/console-icon";
import { ConsoleShell } from "@/components/console/console-shell";
import { RelayAiPanel } from "@/components/console/relay-ai-panel";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/status-badge";
import {
  buildFleetMachineSummaries,
  fleetMachineGroups,
  getFleetMachineGroup,
  machineMatchesFleetSearch,
  normalizeFleetReference,
  type FleetMachineGroup,
  type FleetMachineRecord,
  type FleetMachineSummary,
  type FleetTicketRecord,
} from "@/lib/fleet-workspace";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import { sanitizeUserFacingError } from "@/lib/security";
import { activeTicketStatuses, ticketStatuses } from "@/lib/statuses";
import { getSupabaseClient } from "@/lib/supabase";
import type { TicketPartRecord } from "@/lib/ticket-parts";
import type { TicketPurchaseOrderRecord } from "@/lib/ticket-purchase-orders";
import type { WorkshopIncidentRecord } from "@/lib/workshop-incidents";

const MACHINE_FIELDS = [
  "id",
  "machine_number",
  "machine_number_normalized",
  "fleet_type",
  "item_description",
  "make",
  "model",
  "serial_number",
  "status",
  "quantity",
  "source_sheet",
  "created_at",
  "updated_at",
].join(", ");

const TICKET_FIELDS = [
  "id",
  "user_id",
  "requester_name",
  "department",
  "machine_reference",
  "machine_number",
  "machine_number_normalized",
  "machine_make",
  "machine_model",
  "machine_serial_number",
  "machine_verified",
  "job_number",
  "request_summary",
  "request_details",
  "status",
  "assigned_to",
  "expected_delivery_date",
  "supplier_name",
  "purchase_order_number",
  "order_amount",
  "notes",
  "is_urgent",
  "created_at",
  "updated_at",
].join(", ");

const MACHINE_PAGE_SIZE = 250;
const MACHINE_SEARCH_LIMIT = 250;
const MAX_FLEET_MACHINE_RESULTS = 2500;
const TICKET_MACHINE_BATCH_SIZE = 120;
const TICKET_RESULT_LIMIT = 2000;

type FleetTab = "overview" | "requests" | "parts" | "activity" | "incidents" | "files";
type RequestFilter = "ALL" | "OPEN" | "URGENT" | (typeof ticketStatuses)[number];
type FleetGroupFilter = "ALL" | FleetMachineGroup;

type TicketUpdateRow = {
  id: string;
  ticket_id: string;
  status: string | null;
  comment: string | null;
  created_at: string | null;
};

type TicketAttachmentRow = {
  id: string;
  ticket_id: string;
  file_name: string | null;
  mime_type: string | null;
  attachment_context: string | null;
  created_at: string | null;
};

type FleetAccess = {
  userId: string;
  isAdmin: boolean;
  fleetName: string | null;
  machineIds: string[] | null;
};

export default function FleetPage() {
  return (
    <Suspense fallback={<FleetPageFallback />}>
      <FleetWorkspace />
    </Suspense>
  );
}

function FleetPageFallback() {
  return (
    <AuthGuard>
      <ConsoleShell title="Fleet">
        <div className="fleet-state-panel">Loading Fleet workspace...</div>
      </ConsoleShell>
    </AuthGuard>
  );
}

function FleetWorkspace() {
  const searchParams = useSearchParams();
  const requestedMachine = searchParams.get("machine")?.trim() ?? "";
  const [access, setAccess] = useState<FleetAccess | null>(null);
  const [machines, setMachines] = useState<FleetMachineRecord[]>([]);
  const [tickets, setTickets] = useState<FleetTicketRecord[]>([]);
  const [totalMachineCount, setTotalMachineCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState(requestedMachine);
  const [debouncedQuery, setDebouncedQuery] = useState(requestedMachine);
  const [selectedMachineKey, setSelectedMachineKey] = useState<string | null>(
    requestedMachine ? normalizeFleetReference(requestedMachine) : null,
  );
  const [activeTab, setActiveTab] = useState<FleetTab>("overview");
  const [requestFilter, setRequestFilter] = useState<RequestFilter>("ALL");
  const [groupFilter, setGroupFilter] = useState<FleetGroupFilter>("ALL");
  const [updates, setUpdates] = useState<TicketUpdateRow[]>([]);
  const [parts, setParts] = useState<TicketPartRecord[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<TicketPurchaseOrderRecord[]>([]);
  const [incidents, setIncidents] = useState<WorkshopIncidentRecord[]>([]);
  const [attachments, setAttachments] = useState<TicketAttachmentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isRelayAiOpen, setIsRelayAiOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [detailErrorMessage, setDetailErrorMessage] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 280);

    return () => window.clearTimeout(timeoutId);
  }, [searchQuery]);

  useEffect(() => {
    if (!requestedMachine) {
      return;
    }

    setSearchQuery((current) =>
      normalizeFleetReference(current) === normalizeFleetReference(requestedMachine)
        ? current
        : requestedMachine,
    );
    setSelectedMachineKey(normalizeFleetReference(requestedMachine));
  }, [requestedMachine]);

  useEffect(() => {
    let isMounted = true;

    async function loadAccess() {
      const supabase = getSupabaseClient();
      if (!supabase) {
        setErrorMessage("Supabase environment variables are not configured.");
        setIsLoading(false);
        return;
      }

      try {
        const { user, isAdmin } = await getCurrentUserWithRole(supabase, {
          forceFresh: true,
        });

        if (!user) {
          throw new Error("Sign in to view Fleet.");
        }

        if (isAdmin) {
          if (isMounted) {
            setAccess({
              userId: user.id,
              isAdmin: true,
              fleetName: null,
              machineIds: null,
            });
          }
          return;
        }

        const { data: membership, error: membershipError } = await supabase
          .from("customer_fleet_members")
          .select("fleet_id")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle<{ fleet_id: string }>();

        if (membershipError) {
          throw membershipError;
        }
        if (!membership) {
          throw new Error("No customer fleet is assigned to this account.");
        }

        const [fleetResult, assignmentsResult] = await Promise.all([
          supabase
            .from("customer_fleets")
            .select("name")
            .eq("id", membership.fleet_id)
            .single<{ name: string }>(),
          supabase
            .from("customer_fleet_machines")
            .select("machine_id")
            .eq("fleet_id", membership.fleet_id),
        ]);

        if (fleetResult.error) {
          throw fleetResult.error;
        }
        if (assignmentsResult.error) {
          throw assignmentsResult.error;
        }

        const machineIds = (assignmentsResult.data ?? [])
          .map((assignment) => assignment.machine_id)
          .filter((machineId): machineId is string => typeof machineId === "string");

        if (isMounted) {
          setAccess({
            userId: user.id,
            isAdmin: false,
            fleetName: fleetResult.data.name,
            machineIds,
          });
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(
            sanitizeUserFacingError(error, "Unable to verify Fleet access."),
          );
          setIsLoading(false);
        }
      }
    }

    void loadAccess();
    return () => {
      isMounted = false;
    };
  }, []);

  const loadFleet = useCallback(async () => {
    if (!access) {
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      setErrorMessage("Supabase environment variables are not configured.");
      setIsLoading(false);
      return;
    }

    if (!access.isAdmin && access.machineIds?.length === 0) {
      setMachines([]);
      setTickets([]);
      setTotalMachineCount(0);
      setErrorMessage("");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage("");

    try {
      let machineQuery = supabase
        .from("machines")
        .select(MACHINE_FIELDS)
        .order("machine_number_normalized", { ascending: true });

      if (!access.isAdmin && access.machineIds) {
        machineQuery = machineQuery.in("id", access.machineIds);
      }

      const serverTerm = getServerSearchTerm(debouncedQuery);
      if (serverTerm) {
        const compactTerm = normalizeFleetReference(serverTerm);
        const filters = [
          `machine_number.ilike.%${serverTerm}%`,
          `machine_number_normalized.ilike.%${serverTerm}%`,
          `make.ilike.%${serverTerm}%`,
          `model.ilike.%${serverTerm}%`,
          `serial_number.ilike.%${serverTerm}%`,
          `item_description.ilike.%${serverTerm}%`,
        ];
        if (compactTerm && compactTerm !== serverTerm.toUpperCase()) {
          filters.push(`machine_number_normalized.ilike.%${compactTerm}%`);
        }
        machineQuery = machineQuery
          .or(filters.join(","))
          .limit(MACHINE_SEARCH_LIMIT);
      } else {
        machineQuery = machineQuery.range(0, MACHINE_PAGE_SIZE - 1);
      }

      let countQuery = supabase
        .from("machines")
        .select("id", { count: "exact", head: true });
      if (!access.isAdmin && access.machineIds) {
        countQuery = countQuery.in("id", access.machineIds);
      }

      const [machineResult, countResult] = await Promise.all([
        machineQuery,
        countQuery,
      ]);

      if (machineResult.error) {
        throw machineResult.error;
      }
      if (countResult.error) {
        throw countResult.error;
      }

      let rawMachines = (machineResult.data ?? []) as unknown as FleetMachineRecord[];
      const compactServerTerm = normalizeFleetReference(serverTerm);

      if (!serverTerm) {
        const availableMachineCount = Math.min(
          countResult.count ?? rawMachines.length,
          MAX_FLEET_MACHINE_RESULTS,
        );
        let offset = rawMachines.length;

        while (
          offset < availableMachineCount &&
          rawMachines.length < MAX_FLEET_MACHINE_RESULTS
        ) {
          let nextPageQuery = supabase
            .from("machines")
            .select(MACHINE_FIELDS)
            .order("machine_number_normalized", { ascending: true })
            .range(offset, Math.min(offset + MACHINE_PAGE_SIZE - 1, availableMachineCount - 1));

          if (!access.isAdmin && access.machineIds) {
            nextPageQuery = nextPageQuery.in("id", access.machineIds);
          }

          const nextPageResult = await nextPageQuery;
          if (nextPageResult.error) {
            throw nextPageResult.error;
          }

          const nextRows = (nextPageResult.data ?? []) as unknown as FleetMachineRecord[];
          rawMachines = [...rawMachines, ...nextRows];
          if (nextRows.length < MACHINE_PAGE_SIZE) {
            break;
          }
          offset += nextRows.length;
        }
      }

      if (
        rawMachines.length === 0 &&
        compactServerTerm.length >= 5 &&
        compactServerTerm === serverTerm.toUpperCase()
      ) {
        const fallbackTerm = compactServerTerm.slice(0, 3);
        let fallbackQuery = supabase
          .from("machines")
          .select(MACHINE_FIELDS)
          .or(
            [
              `machine_number.ilike.%${fallbackTerm}%`,
              `machine_number_normalized.ilike.%${fallbackTerm}%`,
              `model.ilike.%${fallbackTerm}%`,
            ].join(","),
          )
          .order("machine_number_normalized", { ascending: true })
          .limit(MACHINE_SEARCH_LIMIT);

        if (!access.isAdmin && access.machineIds) {
          fallbackQuery = fallbackQuery.in("id", access.machineIds);
        }

        const fallbackResult = await fallbackQuery;
        if (fallbackResult.error) {
          throw fallbackResult.error;
        }
        rawMachines = (fallbackResult.data ?? []) as unknown as FleetMachineRecord[];
      }

      const matchingMachines = rawMachines.filter((machine) =>
        machineMatchesFleetSearch(machine, debouncedQuery),
      );
      const matchingTickets = await fetchFleetTickets({
        machines: matchingMachines,
        userId: access.userId,
        isAdmin: access.isAdmin,
      });

      setMachines(matchingMachines);
      setTickets(matchingTickets);
      setTotalMachineCount(countResult.count ?? matchingMachines.length);
      setLastSyncedAt(new Date());
    } catch (error) {
      setMachines([]);
      setTickets([]);
      setErrorMessage(
        sanitizeUserFacingError(error, "Unable to load Fleet records right now."),
      );
    } finally {
      setIsLoading(false);
    }
  }, [access, debouncedQuery]);

  useEffect(() => {
    void loadFleet();
  }, [loadFleet, refreshVersion]);

  const summaries = useMemo(
    () => buildFleetMachineSummaries(machines, tickets),
    [machines, tickets],
  );
  const groupCounts = useMemo(() => {
    const counts = new Map<FleetMachineGroup, number>();
    for (const machine of summaries) {
      const group = getFleetMachineGroup(machine);
      counts.set(group, (counts.get(group) ?? 0) + 1);
    }
    return counts;
  }, [summaries]);
  const visibleSummaries = useMemo(
    () =>
      groupFilter === "ALL"
        ? summaries
        : summaries.filter((machine) => getFleetMachineGroup(machine) === groupFilter),
    [groupFilter, summaries],
  );
  const groupedSummaries = useMemo(
    () =>
      fleetMachineGroups
        .map((group) => ({
          group,
          machines: visibleSummaries.filter(
            (machine) => getFleetMachineGroup(machine) === group,
          ),
        }))
        .filter((entry) => entry.machines.length > 0),
    [visibleSummaries],
  );

  useEffect(() => {
    if (groupFilter !== "ALL" && !groupCounts.get(groupFilter)) {
      setGroupFilter("ALL");
    }
  }, [groupCounts, groupFilter]);

  useEffect(() => {
    if (
      groupFilter === "ALL" ||
      visibleSummaries.some(
        (machine) =>
          normalizeFleetReference(machine.machine_number_normalized) ===
          selectedMachineKey,
      )
    ) {
      return;
    }

    const firstVisibleMachine = visibleSummaries[0];
    setSelectedMachineKey(
      firstVisibleMachine && !window.matchMedia("(max-width: 900px)").matches
        ? normalizeFleetReference(firstVisibleMachine.machine_number_normalized)
        : null,
    );
  }, [groupFilter, selectedMachineKey, visibleSummaries]);

  useEffect(() => {
    if (summaries.length === 0) {
      setSelectedMachineKey(null);
      return;
    }

    setSelectedMachineKey((current) => {
      if (
        current &&
        summaries.some(
          (machine) =>
            normalizeFleetReference(machine.machine_number_normalized) === current,
        )
      ) {
        return current;
      }

      const requestedKey = normalizeFleetReference(requestedMachine);
      const requested = summaries.find(
        (machine) =>
          normalizeFleetReference(machine.machine_number_normalized) === requestedKey,
      );

      if (!requested && window.matchMedia("(max-width: 900px)").matches) {
        return null;
      }

      return normalizeFleetReference(
        requested?.machine_number_normalized ??
          summaries[0].machine_number_normalized,
      );
    });
  }, [requestedMachine, summaries]);

  const selectedMachine =
    summaries.find(
      (machine) =>
        normalizeFleetReference(machine.machine_number_normalized) ===
        selectedMachineKey,
    ) ?? null;

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && selectedMachineKey) {
        setSelectedMachineKey(null);
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [selectedMachineKey]);

  useEffect(() => {
    let isMounted = true;

    async function loadMachineDetail() {
      const supabase = getSupabaseClient();
      if (!supabase || !selectedMachine || !access) {
        setUpdates([]);
        setParts([]);
        setPurchaseOrders([]);
        setIncidents([]);
        setAttachments([]);
        return;
      }

      const ticketIds = selectedMachine.tickets.map((ticket) => ticket.id);
      setIsDetailLoading(true);
      setDetailErrorMessage("");

      const emptyResult = Promise.resolve({ data: [], error: null });
      const updatesQuery =
        ticketIds.length > 0
          ? supabase
              .from("ticket_updates")
              .select("id, ticket_id, status, comment, created_at")
              .in("ticket_id", ticketIds)
              .order("created_at", { ascending: false })
              .limit(500)
          : emptyResult;
      const partsQuery =
        access.isAdmin && ticketIds.length > 0
          ? supabase
              .from("ticket_parts")
              .select("*")
              .in("ticket_id", ticketIds)
              .order("created_at", { ascending: false })
              .limit(500)
          : emptyResult;
      const purchaseOrdersQuery =
        access.isAdmin && ticketIds.length > 0
          ? supabase
              .from("ticket_purchase_orders")
              .select("*")
              .in("ticket_id", ticketIds)
              .order("created_at", { ascending: false })
              .limit(500)
          : emptyResult;
      const attachmentQuery =
        ticketIds.length > 0
          ? supabase
              .from("ticket_attachments")
              .select("id, ticket_id, file_name, mime_type, attachment_context, created_at")
              .in("ticket_id", ticketIds)
              .order("created_at", { ascending: false })
              .limit(500)
          : emptyResult;
      const incidentReferences = Array.from(
        new Set(
          [
            selectedMachine.machine_number,
            selectedMachine.machine_number_normalized,
          ].filter(Boolean),
        ),
      );
      const incidentsQuery =
        access.isAdmin && incidentReferences.length > 0
          ? supabase
              .from("workshop_incidents")
              .select("*")
              .in("machine_reference", incidentReferences)
              .order("updated_at", { ascending: false })
              .limit(200)
          : emptyResult;

      const results = await Promise.all([
        updatesQuery,
        partsQuery,
        purchaseOrdersQuery,
        attachmentQuery,
        incidentsQuery,
      ]);

      if (!isMounted) {
        return;
      }

      const firstError = results.find((result) => result.error)?.error;
      setUpdates((results[0].data ?? []) as TicketUpdateRow[]);
      setParts((results[1].data ?? []) as TicketPartRecord[]);
      setPurchaseOrders((results[2].data ?? []) as TicketPurchaseOrderRecord[]);
      setAttachments((results[3].data ?? []) as TicketAttachmentRow[]);
      setIncidents(
        ((results[4].data ?? []) as WorkshopIncidentRecord[]).filter(
          (incident) =>
            normalizeFleetReference(incident.machine_reference) ===
            normalizeFleetReference(selectedMachine.machine_number_normalized),
        ),
      );
      setDetailErrorMessage(
        firstError
          ? "Some linked machine records could not be loaded. Ticket data remains available."
          : "",
      );
      setIsDetailLoading(false);
    }

    void loadMachineDetail().catch((error) => {
      if (isMounted) {
        setDetailErrorMessage(
          sanitizeUserFacingError(error, "Unable to load linked machine records."),
        );
        setIsDetailLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [access, selectedMachine]);

  const summaryMetrics = useMemo(
    () => ({
      visibleMachines: visibleSummaries.length,
      linkedRequests: visibleSummaries.reduce(
        (total, machine) => total + machine.total_requests,
        0,
      ),
      openRequests: visibleSummaries.reduce(
        (total, machine) => total + machine.open_requests,
        0,
      ),
      urgentRequests: visibleSummaries.reduce(
        (total, machine) => total + machine.urgent_requests,
        0,
      ),
    }),
    [visibleSummaries],
  );

  function selectMachine(machine: FleetMachineSummary) {
    setSelectedMachineKey(normalizeFleetReference(machine.machine_number_normalized));
    setActiveTab("overview");
    setRequestFilter("ALL");
  }

  return (
    <AuthGuard>
      <ConsoleShell
        eyebrow={access?.isAdmin ? "RELAY machine intelligence" : "RELAY customer fleet"}
        title="Fleet"
        searchValue={searchQuery}
        searchPlaceholder="Search plant number, make, model, serial number or description"
        onSearchChange={setSearchQuery}
        onOpenRelayAi={access?.isAdmin ? () => setIsRelayAiOpen(true) : undefined}
        isRelayAiOpen={isRelayAiOpen}
        contentClassName="console-content-fleet"
        actions={
          <button
            type="button"
            className="console-command-action"
            onClick={() => setRefreshVersion((current) => current + 1)}
            disabled={isLoading}
          >
            <ConsoleIcon
              name="refresh"
              className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
            />
            <span>{isLoading ? "Syncing" : "Refresh"}</span>
          </button>
        }
      >
        <PageHeader
          title={access?.fleetName ? `${access.fleetName} Fleet` : "Fleet workspace"}
          description={
            access?.isAdmin
              ? "Search the verified machine registry and inspect every linked RELAY request, part, order and workshop event."
              : "Track assigned machines and the RELAY requests available to this account."
          }
          meta={
            <>
              <span className="relay-live-indicator">
                <span aria-hidden="true" />
                Live registry
              </span>
              <span>
                {lastSyncedAt
                  ? `Last synced ${lastSyncedAt.toLocaleTimeString("en-GB", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}`
                  : "Connecting to Supabase"}
              </span>
            </>
          }
        />

        {errorMessage ? (
          <div className="fleet-error-state" role="alert">
            {errorMessage}
          </div>
        ) : null}

        <section className="fleet-summary-strip" aria-label="Fleet summary">
          <FleetMetric
            label="Total machines"
            value={totalMachineCount}
            detail={access?.isAdmin ? "Registry records" : "Assigned fleet"}
          />
          <FleetMetric
            label="Matching machines"
            value={summaryMetrics.visibleMachines}
            detail={
              debouncedQuery
                ? "Current search"
                : totalMachineCount > MAX_FLEET_MACHINE_RESULTS
                  ? `First ${MAX_FLEET_MACHINE_RESULTS.toLocaleString("en-GB")}`
                  : "Complete registry"
            }
          />
          <FleetMetric
            label="Linked requests"
            value={summaryMetrics.linkedRequests}
            detail="Across visible machines"
          />
          <FleetMetric
            label="Open requests"
            value={summaryMetrics.openRequests}
            detail={`${summaryMetrics.urgentRequests} urgent`}
            tone={summaryMetrics.urgentRequests > 0 ? "danger" : "default"}
          />
        </section>

        <section className="fleet-workspace">
          <div className="fleet-results-panel">
            <div className="fleet-panel-heading">
              <div>
                <p className="console-section-label">Machine registry</p>
                <h2>
                  {isLoading
                    ? "Searching machines"
                    : `${visibleSummaries.length} matching machine${visibleSummaries.length === 1 ? "" : "s"}`}
                </h2>
              </div>
              <div className="fleet-heading-controls">
                <label>
                  <span className="sr-only">Machine category</span>
                  <select
                    value={groupFilter}
                    onChange={(event) =>
                      setGroupFilter(event.target.value as FleetGroupFilter)
                    }
                  >
                    <option value="ALL">All machine groups</option>
                    {fleetMachineGroups.map((group) => (
                      <option key={group} value={group} disabled={!groupCounts.get(group)}>
                        {group} ({groupCounts.get(group) ?? 0})
                      </option>
                    ))}
                  </select>
                </label>
                {debouncedQuery ? (
                  <button type="button" onClick={() => setSearchQuery("")}>
                    Clear search
                  </button>
                ) : null}
              </div>
            </div>

            <div className="fleet-result-columns" aria-hidden="true">
              <span>Plant / machine</span>
              <span>Machine record</span>
              <span>Requests</span>
              <span>Last activity</span>
            </div>

            <div className="fleet-result-list" aria-live="polite">
              {isLoading ? (
                <FleetListSkeleton />
              ) : visibleSummaries.length === 0 ? (
                <div className="fleet-empty-state">
                  <ConsoleIcon name="fleet" className="h-7 w-7" />
                  <h3>No matching machines</h3>
                  <p>
                    Try a plant number, make, model, serial number or a shorter
                    machine description.
                  </p>
                </div>
              ) : (
                groupedSummaries.map((entry) => (
                  <section key={entry.group} className="fleet-machine-group">
                    <div className="fleet-machine-group-heading">
                      <span>{entry.group}</span>
                      <strong>{entry.machines.length}</strong>
                    </div>
                    {entry.machines.map((machine) => (
                      <MachineResultRow
                        key={machine.id}
                        machine={machine}
                        selected={
                          normalizeFleetReference(machine.machine_number_normalized) ===
                          selectedMachineKey
                        }
                        onSelect={() => selectMachine(machine)}
                      />
                    ))}
                  </section>
                ))
              )}
            </div>
          </div>

          <aside
            id="fleet-machine-detail"
            className={`fleet-detail-panel ${selectedMachine ? "fleet-detail-panel-open" : ""}`}
            aria-label="Selected machine details"
          >
            {selectedMachine ? (
              <MachineDetailWorkspace
                machine={selectedMachine}
                isAdmin={Boolean(access?.isAdmin)}
                activeTab={activeTab}
                requestFilter={requestFilter}
                updates={updates}
                parts={parts}
                purchaseOrders={purchaseOrders}
                incidents={incidents}
                attachments={attachments}
                isLoading={isDetailLoading}
                errorMessage={detailErrorMessage}
                onTabChange={setActiveTab}
                onRequestFilterChange={setRequestFilter}
                onClose={() => setSelectedMachineKey(null)}
                onViewOpenRequests={() => {
                  setActiveTab("requests");
                  setRequestFilter("OPEN");
                }}
              />
            ) : (
              <div className="fleet-detail-empty">
                <ConsoleIcon name="fleet" className="h-8 w-8" />
                <h2>Select a machine</h2>
                <p>Choose a registry result to inspect its complete RELAY history.</p>
              </div>
            )}
          </aside>
        </section>

        {access?.isAdmin ? (
          <RelayAiPanel isOpen={isRelayAiOpen} onClose={() => setIsRelayAiOpen(false)} />
        ) : null}
      </ConsoleShell>
    </AuthGuard>
  );
}

function MachineResultRow({
  machine,
  selected,
  onSelect,
}: {
  machine: FleetMachineSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`fleet-result-row ${selected ? "fleet-result-row-selected" : ""}`}
      onClick={onSelect}
      aria-expanded={selected}
      aria-controls="fleet-machine-detail"
    >
      <span className="fleet-result-primary">
        <strong>{machine.machine_number}</strong>
        <small>{formatMachineType(machine.fleet_type)}</small>
      </span>
      <span className="fleet-result-machine">
        <strong>
          {[machine.make, machine.model].filter(Boolean).join(" ") ||
            machine.item_description ||
            "Machine details unavailable"}
        </strong>
        <small>
          {machine.serial_number ? `Serial ${machine.serial_number}` : "Serial not recorded"}
          {machine.status ? ` · ${formatLabel(machine.status)}` : ""}
        </small>
      </span>
      <span className="fleet-result-requests">
        <strong>{machine.open_requests} open</strong>
        <small>{machine.total_requests} total</small>
      </span>
      <span className="fleet-result-activity">
        <strong>{formatDate(machine.last_activity_at)}</strong>
        <small>
          {machine.latest_ticket?.job_number
            ? `Job ${machine.latest_ticket.job_number}`
            : "Registry activity"}
        </small>
      </span>
      <ConsoleIcon name="chevron" className="fleet-result-chevron" />
    </button>
  );
}

function MachineDetailWorkspace({
  machine,
  isAdmin,
  activeTab,
  requestFilter,
  updates,
  parts,
  purchaseOrders,
  incidents,
  attachments,
  isLoading,
  errorMessage,
  onTabChange,
  onRequestFilterChange,
  onClose,
  onViewOpenRequests,
}: {
  machine: FleetMachineSummary;
  isAdmin: boolean;
  activeTab: FleetTab;
  requestFilter: RequestFilter;
  updates: TicketUpdateRow[];
  parts: TicketPartRecord[];
  purchaseOrders: TicketPurchaseOrderRecord[];
  incidents: WorkshopIncidentRecord[];
  attachments: TicketAttachmentRow[];
  isLoading: boolean;
  errorMessage: string;
  onTabChange: (tab: FleetTab) => void;
  onRequestFilterChange: (filter: RequestFilter) => void;
  onClose: () => void;
  onViewOpenRequests: () => void;
}) {
  const tabs: Array<{ id: FleetTab; label: string; count?: number }> = [
    { id: "overview", label: "Overview" },
    { id: "requests", label: "Requests", count: machine.total_requests },
    { id: "parts", label: "Parts & POs", count: parts.length + purchaseOrders.length },
    { id: "activity", label: "Activity", count: updates.length },
    { id: "incidents", label: "Incidents", count: incidents.length },
    { id: "files", label: "Files", count: attachments.length },
  ];
  const filteredTickets =
    requestFilter === "ALL"
      ? machine.tickets
      : requestFilter === "OPEN"
        ? machine.tickets.filter((ticket) =>
            activeTicketStatuses.includes(
              (ticket.status?.toUpperCase() ||
                "PENDING") as (typeof activeTicketStatuses)[number],
            ),
          )
        : requestFilter === "URGENT"
          ? machine.tickets.filter((ticket) => ticket.is_urgent)
          : machine.tickets.filter(
              (ticket) =>
                (ticket.status?.toUpperCase() || "PENDING") === requestFilter,
            );

  return (
    <div className="fleet-detail-inner">
      <div className="fleet-detail-header">
        <div>
          <div className="fleet-detail-kicker">
            <span>Plant number</span>
            <span className="fleet-verified-state">
              <span aria-hidden="true" />
              Registry verified
            </span>
          </div>
          <h2>{machine.machine_number}</h2>
          <p>
            {[machine.make, machine.model].filter(Boolean).join(" ") ||
              machine.item_description ||
              "Machine details unavailable"}
          </p>
          <div className="fleet-detail-meta">
            <span>{machine.serial_number ? `Serial ${machine.serial_number}` : "Serial not recorded"}</span>
            <span>{machine.status ? formatLabel(machine.status) : "Status not recorded"}</span>
            <span>Updated {formatDateTime(machine.updated_at)}</span>
          </div>
        </div>
        <button
          type="button"
          className="console-icon-button fleet-detail-close"
          onClick={onClose}
          aria-label="Close machine details"
        >
          <ConsoleIcon name="close" className="h-4 w-4" />
        </button>
      </div>

      <div className="fleet-detail-actions">
        <Link
          className="console-primary-action"
          href={`/submit?machineReference=${encodeURIComponent(machine.machine_number)}`}
        >
          Raise request
        </Link>
        <button type="button" onClick={onViewOpenRequests}>
          View open requests
        </button>
        <button type="button" onClick={() => onTabChange("overview")}>
          Open machine record
        </button>
        {isAdmin ? (
          <Link
            href={`/incidents/damage/new?machineReference=${encodeURIComponent(machine.machine_number)}`}
          >
            Report incident
          </Link>
        ) : null}
      </div>

      <div className="fleet-tabs" role="tablist" aria-label="Machine workspace">
        {tabs.map((tab) => (
          <button
            type="button"
            role="tab"
            key={tab.id}
            aria-selected={activeTab === tab.id}
            aria-controls={`fleet-tab-${tab.id}`}
            className={activeTab === tab.id ? "fleet-tab-active" : ""}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
            {typeof tab.count === "number" ? <span>{tab.count}</span> : null}
          </button>
        ))}
      </div>

      {errorMessage ? (
        <div className="fleet-detail-warning" role="status">
          {errorMessage}
        </div>
      ) : null}

      <div
        id={`fleet-tab-${activeTab}`}
        className="fleet-tab-content"
        role="tabpanel"
      >
        {isLoading ? (
          <div className="fleet-detail-loading">Loading linked records...</div>
        ) : null}
        {!isLoading && activeTab === "overview" ? (
          <MachineOverview machine={machine} />
        ) : null}
        {!isLoading && activeTab === "requests" ? (
          <MachineRequests
            tickets={filteredTickets}
            filter={requestFilter}
            onFilterChange={onRequestFilterChange}
          />
        ) : null}
        {!isLoading && activeTab === "parts" ? (
          <MachinePartsAndOrders
            machine={machine}
            parts={parts}
            purchaseOrders={purchaseOrders}
          />
        ) : null}
        {!isLoading && activeTab === "activity" ? (
          <MachineActivity tickets={machine.tickets} updates={updates} />
        ) : null}
        {!isLoading && activeTab === "incidents" ? (
          <MachineIncidents incidents={incidents} isAdmin={isAdmin} />
        ) : null}
        {!isLoading && activeTab === "files" ? (
          <MachineFiles attachments={attachments} tickets={machine.tickets} />
        ) : null}
      </div>
    </div>
  );
}

function MachineOverview({ machine }: { machine: FleetMachineSummary }) {
  return (
    <div className="fleet-overview">
      <section className="fleet-detail-section">
        <div className="fleet-section-heading">
          <h3>Machine record</h3>
          <span>{formatMachineType(machine.fleet_type)}</span>
        </div>
        <dl className="fleet-definition-grid">
          <FleetDefinition label="Plant number" value={machine.machine_number} />
          <FleetDefinition label="Machine group" value={getFleetMachineGroup(machine)} />
          <FleetDefinition label="Make" value={machine.make} />
          <FleetDefinition label="Model" value={machine.model} />
          <FleetDefinition label="Serial number" value={machine.serial_number} />
          <FleetDefinition label="Description" value={machine.item_description} wide />
          <FleetDefinition label="Status" value={machine.status ? formatLabel(machine.status) : null} />
          <FleetDefinition label="Quantity" value={machine.quantity ? String(machine.quantity) : null} />
          <FleetDefinition label="Registry source" value={machine.source_sheet} />
          <FleetDefinition label="Created" value={formatDateTime(machine.created_at)} />
          <FleetDefinition label="Updated" value={formatDateTime(machine.updated_at)} />
        </dl>
      </section>

      <section className="fleet-overview-metrics">
        <FleetMiniMetric label="Total requests" value={machine.total_requests} />
        <FleetMiniMetric label="Open" value={machine.open_requests} />
        <FleetMiniMetric label="Completed" value={machine.completed_requests} />
        <FleetMiniMetric label="Urgent" value={machine.urgent_requests} />
        <FleetMiniMetric
          label="Linked order value"
          value={formatCurrency(machine.linked_order_value)}
        />
      </section>

      <section className="fleet-detail-section">
        <div className="fleet-section-heading">
          <h3>Latest RELAY activity</h3>
          <span>{formatDateTime(machine.last_activity_at)}</span>
        </div>
        {machine.latest_ticket ? (
          <TicketListItem ticket={machine.latest_ticket} />
        ) : (
          <FleetEmptyState message="No RELAY requests are linked to this machine." />
        )}
      </section>
    </div>
  );
}

function MachineRequests({
  tickets,
  filter,
  onFilterChange,
}: {
  tickets: FleetTicketRecord[];
  filter: RequestFilter;
  onFilterChange: (filter: RequestFilter) => void;
}) {
  const filters: RequestFilter[] = ["ALL", "OPEN", "URGENT", ...ticketStatuses];

  return (
    <section className="fleet-detail-section">
      <div className="fleet-request-filters" role="group" aria-label="Request status">
        {filters.map((option) => (
          <button
            type="button"
            key={option}
            className={filter === option ? "fleet-request-filter-active" : ""}
            onClick={() => onFilterChange(option)}
          >
            {formatLabel(option)}
          </button>
        ))}
      </div>
      {tickets.length > 0 ? (
        <div className="fleet-ticket-list">
          {tickets.map((ticket) => (
            <TicketListItem key={ticket.id} ticket={ticket} detailed />
          ))}
        </div>
      ) : (
        <FleetEmptyState message="No requests match this status filter." />
      )}
    </section>
  );
}

function TicketListItem({
  ticket,
  detailed = false,
}: {
  ticket: FleetTicketRecord;
  detailed?: boolean;
}) {
  return (
    <Link href={`/tickets/${ticket.id}`} className="fleet-ticket-row">
      <div className="fleet-ticket-topline">
        <div>
          <strong>{ticket.job_number ? `Job ${ticket.job_number}` : "Request without job number"}</strong>
          {ticket.is_urgent ? <span className="fleet-urgent-label">Urgent</span> : null}
        </div>
        <StatusBadge status={ticket.status || "PENDING"} />
      </div>
      <p>
        {ticket.request_summary || ticket.request_details || "No request summary recorded."}
      </p>
      {detailed ? (
        <dl className="fleet-ticket-meta">
          <div><dt>Requester</dt><dd>{ticket.requester_name || "Not recorded"}</dd></div>
          <div><dt>Department</dt><dd>{ticket.department || "Not recorded"}</dd></div>
          <div><dt>Assigned</dt><dd>{ticket.assigned_to || "Unassigned"}</dd></div>
          <div><dt>Supplier</dt><dd>{ticket.supplier_name || "Not recorded"}</dd></div>
          <div><dt>PO</dt><dd>{ticket.purchase_order_number || "Not recorded"}</dd></div>
          <div><dt>Expected</dt><dd>{formatDate(ticket.expected_delivery_date)}</dd></div>
          <div><dt>Order value</dt><dd>{formatCurrency(ticket.order_amount)}</dd></div>
          <div><dt>Updated</dt><dd>{formatDateTime(ticket.updated_at)}</dd></div>
        </dl>
      ) : (
        <span className="fleet-ticket-date">Updated {formatDateTime(ticket.updated_at)}</span>
      )}
    </Link>
  );
}

function MachinePartsAndOrders({
  machine,
  parts,
  purchaseOrders,
}: {
  machine: FleetMachineSummary;
  parts: TicketPartRecord[];
  purchaseOrders: TicketPurchaseOrderRecord[];
}) {
  const ticketsById = new Map(machine.tickets.map((ticket) => [ticket.id, ticket]));

  return (
    <div className="fleet-detail-stack">
      <section className="fleet-detail-section">
        <div className="fleet-section-heading">
          <h3>Linked parts</h3>
          <span>{parts.length} records</span>
        </div>
        {parts.length > 0 ? (
          <div className="fleet-data-table-wrap">
            <table className="fleet-data-table">
              <thead>
                <tr>
                  <th>Part number</th>
                  <th>Description</th>
                  <th>Qty</th>
                  <th>Supplier</th>
                  <th>Job</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {parts.map((part) => (
                  <tr key={part.id}>
                    <td><strong>{part.part_number || "—"}</strong></td>
                    <td>{part.part_description || "—"}</td>
                    <td>{part.quantity}</td>
                    <td>{part.supplier_name || "—"}</td>
                    <td>
                      <Link href={`/tickets/${part.ticket_id}`}>
                        {part.job_number || ticketsById.get(part.ticket_id)?.job_number || "Open"}
                      </Link>
                    </td>
                    <td>{formatLabel(part.part_status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <FleetEmptyState message="No ticket-linked parts are recorded for this machine." />
        )}
      </section>

      <section className="fleet-detail-section">
        <div className="fleet-section-heading">
          <h3>Purchase orders</h3>
          <span>{purchaseOrders.length} records</span>
        </div>
        {purchaseOrders.length > 0 ? (
          <div className="fleet-data-table-wrap">
            <table className="fleet-data-table">
              <thead>
                <tr>
                  <th>PO</th>
                  <th>Supplier</th>
                  <th>Job</th>
                  <th>Status</th>
                  <th>Value</th>
                  <th>Ordered</th>
                </tr>
              </thead>
              <tbody>
                {purchaseOrders.map((order) => (
                  <tr key={order.id}>
                    <td><strong>{order.purchase_order_number}</strong></td>
                    <td>{order.supplier_name}</td>
                    <td>
                      <Link href={`/tickets/${order.ticket_id}`}>
                        {ticketsById.get(order.ticket_id)?.job_number || "Open"}
                      </Link>
                    </td>
                    <td>{formatLabel(order.po_status)}</td>
                    <td>{formatCurrency(order.order_amount)}</td>
                    <td>{formatDate(order.sent_at || order.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <FleetEmptyState message="No ticket-linked purchase orders are recorded for this machine." />
        )}
      </section>
    </div>
  );
}

function MachineActivity({
  tickets,
  updates,
}: {
  tickets: FleetTicketRecord[];
  updates: TicketUpdateRow[];
}) {
  const ticketsById = new Map(tickets.map((ticket) => [ticket.id, ticket]));
  const timeline = [
    ...updates.map((update) => ({
      id: `update-${update.id}`,
      ticketId: update.ticket_id,
      title: update.status ? `Status changed to ${formatLabel(update.status)}` : "Ticket update",
      detail: update.comment || "No additional note recorded.",
      createdAt: update.created_at,
    })),
    ...tickets.map((ticket) => ({
      id: `ticket-${ticket.id}`,
      ticketId: ticket.id,
      title: ticket.job_number ? `Job ${ticket.job_number} created` : "Request created",
      detail: ticket.request_summary || ticket.request_details || "No request summary recorded.",
      createdAt: ticket.created_at,
    })),
  ].sort(
    (left, right) =>
      new Date(right.createdAt || 0).getTime() -
      new Date(left.createdAt || 0).getTime(),
  );

  return (
    <section className="fleet-detail-section">
      {timeline.length > 0 ? (
        <ol className="fleet-timeline">
          {timeline.map((event) => (
            <li key={event.id}>
              <span aria-hidden="true" />
              <div>
                <div>
                  <strong>{event.title}</strong>
                  <time>{formatDateTime(event.createdAt)}</time>
                </div>
                <p>{event.detail}</p>
                <Link href={`/tickets/${event.ticketId}`}>
                  {ticketsById.get(event.ticketId)?.job_number
                    ? `Open job ${ticketsById.get(event.ticketId)?.job_number}`
                    : "Open request"}
                </Link>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <FleetEmptyState message="No machine activity is recorded yet." />
      )}
    </section>
  );
}

function MachineIncidents({
  incidents,
  isAdmin,
}: {
  incidents: WorkshopIncidentRecord[];
  isAdmin: boolean;
}) {
  if (!isAdmin) {
    return (
      <FleetEmptyState message="Workshop incidents are available to authorised operational roles." />
    );
  }

  return (
    <section className="fleet-detail-section">
      {incidents.length > 0 ? (
        <div className="fleet-ticket-list">
          {incidents.map((incident) => (
            <Link
              key={incident.id}
              href={`/incidents/${incident.id}`}
              className="fleet-incident-row"
            >
              <div>
                <strong>{formatLabel(incident.incident_type)}</strong>
                <StatusBadge status={incident.status} />
              </div>
              <p>{incident.description}</p>
              <span>
                {formatLabel(incident.severity)} · {incident.location_summary || "Location not recorded"} · Updated {formatDateTime(incident.updated_at)}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <FleetEmptyState message="No workshop incidents are linked to this machine." />
      )}
    </section>
  );
}

function MachineFiles({
  attachments,
  tickets,
}: {
  attachments: TicketAttachmentRow[];
  tickets: FleetTicketRecord[];
}) {
  const ticketsById = new Map(tickets.map((ticket) => [ticket.id, ticket]));

  return (
    <section className="fleet-detail-section">
      {attachments.length > 0 ? (
        <div className="fleet-file-list">
          {attachments.map((attachment) => (
            <Link key={attachment.id} href={`/tickets/${attachment.ticket_id}`}>
              <ConsoleIcon name="file" className="h-5 w-5" />
              <span>
                <strong>{attachment.file_name || "Ticket attachment"}</strong>
                <small>
                  {attachment.mime_type || "File"} ·{" "}
                  {ticketsById.get(attachment.ticket_id)?.job_number
                    ? `Job ${ticketsById.get(attachment.ticket_id)?.job_number}`
                    : "Request attachment"}
                </small>
              </span>
              <time>{formatDate(attachment.created_at)}</time>
            </Link>
          ))}
        </div>
      ) : (
        <FleetEmptyState message="No request-linked files are available for this machine." />
      )}
      <p className="fleet-file-security-note">
        Files open through the existing ticket workspace so current attachment permissions and signed access remain enforced.
      </p>
    </section>
  );
}

function FleetMetric({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: number;
  detail: string;
  tone?: "default" | "danger";
}) {
  return (
    <article className="fleet-metric" data-tone={tone}>
      <p>{label}</p>
      <strong>{value.toLocaleString("en-GB")}</strong>
      <span>{detail}</span>
    </article>
  );
}

function FleetMiniMetric({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div>
      <span>{label}</span>
      <strong>{typeof value === "number" ? value.toLocaleString("en-GB") : value}</strong>
    </div>
  );
}

function FleetDefinition({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string | null | undefined;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "fleet-definition-wide" : undefined}>
      <dt>{label}</dt>
      <dd>{value || "Not recorded"}</dd>
    </div>
  );
}

function FleetEmptyState({ message }: { message: string }) {
  return <div className="fleet-inline-empty">{message}</div>;
}

function FleetListSkeleton() {
  return (
    <div className="fleet-list-skeleton" aria-label="Loading machine results">
      {Array.from({ length: 6 }, (_, index) => (
        <span key={index} />
      ))}
    </div>
  );
}

async function fetchFleetTickets({
  machines,
  userId,
  isAdmin,
}: {
  machines: FleetMachineRecord[];
  userId: string;
  isAdmin: boolean;
}) {
  if (machines.length === 0) {
    return [];
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase environment variables are not configured.");
  }

  function scopeQuery<T extends { or: (filter: string) => T }>(query: T) {
    return isAdmin
      ? query
      : query.or(`user_id.eq.${userId},visible_to_user_id.eq.${userId}`);
  }

  const machineBatches = chunkMachines(machines, TICKET_MACHINE_BATCH_SIZE);
  const ticketQueries = machineBatches.flatMap((batch) => {
    const batchNormalizedKeys = Array.from(
      new Set(batch.map((machine) => machine.machine_number_normalized).filter(Boolean)),
    );
    const batchDisplayKeys = Array.from(
      new Set(batch.map((machine) => machine.machine_number).filter(Boolean)),
    );

    return [
      scopeQuery(
        supabase
          .from("tickets")
          .select(TICKET_FIELDS)
          .in("machine_number_normalized", batchNormalizedKeys)
          .order("updated_at", { ascending: false })
          .limit(TICKET_RESULT_LIMIT),
      ),
      scopeQuery(
        supabase
          .from("tickets")
          .select(TICKET_FIELDS)
          .is("machine_number_normalized", null)
          .in("machine_reference", batchDisplayKeys)
          .order("updated_at", { ascending: false })
          .limit(TICKET_RESULT_LIMIT),
      ),
      scopeQuery(
        supabase
          .from("tickets")
          .select(TICKET_FIELDS)
          .is("machine_number_normalized", null)
          .in("machine_number", batchDisplayKeys)
          .order("updated_at", { ascending: false })
          .limit(TICKET_RESULT_LIMIT),
      ),
    ];
  });
  const results = await Promise.all(ticketQueries);
  const firstError = results.find((result) => result.error)?.error;

  if (firstError) {
    throw firstError;
  }

  const ticketsById = new Map<string, FleetTicketRecord>();
  for (const result of results) {
    for (const ticket of (result.data ?? []) as unknown as FleetTicketRecord[]) {
      ticketsById.set(ticket.id, ticket);
    }
  }

  return Array.from(ticketsById.values());
}

function chunkMachines(machines: FleetMachineRecord[], size: number) {
  const chunks: FleetMachineRecord[][] = [];
  for (let index = 0; index < machines.length; index += size) {
    chunks.push(machines.slice(index, index + size));
  }
  return chunks;
}

function getServerSearchTerm(query: string) {
  return (
    query
      .trim()
      .split(/\s+/)
      .map((term) => term.replace(/[%(),]/g, ""))
      .filter(Boolean)
      .sort((left, right) => right.length - left.length)[0] ?? ""
  );
}

function formatMachineType(value: string | null) {
  return value ? formatLabel(value) : "Fleet equipment";
}

function formatLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Not recorded";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not recorded";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Not recorded";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not recorded";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatCurrency(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "Not recorded";
  }

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(value);
}
