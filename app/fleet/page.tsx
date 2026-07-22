"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { ConsoleIcon } from "@/components/console/console-icon";
import { ConsoleShell } from "@/components/console/console-shell";
import { StatusBadge } from "@/components/status-badge";
import {
  buildCustomerFleetDashboard,
  type CustomerFleetMachine,
  type CustomerFleetMachineSummary,
  type CustomerFleetPeriod,
  type CustomerFleetTicket,
} from "@/lib/customer-fleet";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import { sanitizeUserFacingError } from "@/lib/security";
import { getSupabaseClient } from "@/lib/supabase";

type CustomerFleet = {
  id: string;
  name: string;
  slug: string;
};

const periodOptions: Array<{ value: CustomerFleetPeriod; label: string }> = [
  { value: 30, label: "Past 30 days" },
  { value: 90, label: "Past 90 days" },
  { value: 365, label: "Past year" },
  { value: null, label: "All time" },
];

export default function CustomerFleetPage() {
  const [fleet, setFleet] = useState<CustomerFleet | null>(null);
  const [machines, setMachines] = useState<CustomerFleetMachine[]>([]);
  const [tickets, setTickets] = useState<CustomerFleetTicket[]>([]);
  const [periodDays, setPeriodDays] = useState<CustomerFleetPeriod>(30);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMachineKey, setSelectedMachineKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const loadFleet = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const supabase = getSupabaseClient();

      if (!supabase) {
        throw new Error("Supabase environment variables are not configured.");
      }

      const { user } = await getCurrentUserWithRole(supabase, { forceFresh: true });

      if (!user) {
        throw new Error("Sign in to view your fleet.");
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
        setFleet(null);
        setMachines([]);
        setTickets([]);
        setErrorMessage("No customer fleet is assigned to this account.");
        return;
      }

      const [fleetResult, assignmentsResult, ticketsResult] = await Promise.all([
        supabase
          .from("customer_fleets")
          .select("id, name, slug")
          .eq("id", membership.fleet_id)
          .single<CustomerFleet>(),
        supabase
          .from("customer_fleet_machines")
          .select("machine_id")
          .eq("fleet_id", membership.fleet_id),
        supabase
          .from("tickets")
          .select(
            "id, job_number, machine_reference, machine_number, machine_number_normalized, request_summary, request_details, status, created_at, updated_at",
          )
          .or(`user_id.eq.${user.id},visible_to_user_id.eq.${user.id}`)
          .order("created_at", { ascending: false })
          .limit(2000),
      ]);

      if (fleetResult.error) {
        throw fleetResult.error;
      }

      if (assignmentsResult.error) {
        throw assignmentsResult.error;
      }

      if (ticketsResult.error) {
        throw ticketsResult.error;
      }

      const machineIds = (assignmentsResult.data ?? [])
        .map((assignment) => assignment.machine_id)
        .filter((machineId): machineId is string => typeof machineId === "string");

      let fleetMachines: CustomerFleetMachine[] = [];

      if (machineIds.length > 0) {
        const { data: machineData, error: machineError } = await supabase
          .from("machines")
          .select(
            "id, machine_number, machine_number_normalized, fleet_type, item_description, make, model, serial_number",
          )
          .in("id", machineIds)
          .order("machine_number_normalized", { ascending: true });

        if (machineError) {
          throw machineError;
        }

        fleetMachines = (machineData ?? []) as CustomerFleetMachine[];
      }

      setFleet(fleetResult.data);
      setMachines(fleetMachines);
      setTickets((ticketsResult.data ?? []) as CustomerFleetTicket[]);
      setSelectedMachineKey((current) =>
        current && fleetMachines.some((machine) => machine.machine_number_normalized === current)
          ? current
          : fleetMachines[0]?.machine_number_normalized ?? null,
      );
    } catch (error) {
      setFleet(null);
      setMachines([]);
      setTickets([]);
      setErrorMessage(sanitizeUserFacingError(error, "Unable to load your fleet right now."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadFleet(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadFleet]);

  const dashboard = useMemo(
    () => buildCustomerFleetDashboard({ machines, tickets, periodDays }),
    [machines, periodDays, tickets],
  );
  const filteredMachines = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return dashboard.machines;
    }

    return dashboard.machines.filter((machine) =>
      [
        machine.machine_number,
        machine.make,
        machine.model,
        machine.serial_number,
        machine.item_description,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [dashboard.machines, searchQuery]);
  const selectedMachine =
    dashboard.machines.find(
      (machine) => machine.machine_number_normalized === selectedMachineKey,
    ) ?? filteredMachines[0] ?? null;
  const periodLabel = periodOptions.find((option) => option.value === periodDays)?.label ?? "Selected period";

  return (
    <AuthGuard>
      <ConsoleShell
        eyebrow="RELAY customer fleet"
        title={fleet?.name ? `${fleet.name} Fleet` : "My Fleet"}
        searchValue={searchQuery}
        searchPlaceholder="Search fleet number, model or serial"
        onSearchChange={setSearchQuery}
        actions={
          <>
            <select
              className="console-command-select"
              value={periodDays ?? "all"}
              onChange={(event) =>
                setPeriodDays(event.target.value === "all" ? null : Number(event.target.value) as CustomerFleetPeriod)
              }
              aria-label="Fleet reporting period"
            >
              {periodOptions.map((option) => (
                <option key={option.label} value={option.value ?? "all"}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="console-command-action"
              onClick={() => void loadFleet()}
              disabled={isLoading}
            >
              <ConsoleIcon name="refresh" className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              <span>{isLoading ? "Syncing" : "Refresh"}</span>
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <section className="overflow-hidden rounded-[1.1rem] border border-[var(--border)] bg-[var(--background-raised)] shadow-[var(--shadow-sm)]">
            <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:p-8">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--success)]">
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 rounded-full bg-[var(--success)] shadow-[0_0_0_4px_var(--success-soft)]"
                  />
                  Verified customer fleet
                </div>
                <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-[var(--foreground-strong)] sm:text-4xl">
                  {fleet?.name ?? "Customer fleet"}
                </h2>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--foreground-muted)] sm:text-base">
                  Track verified machines and the requests submitted or shared with this account. Fleet records remain available to RELAY users for machine verification.
                </p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--background-muted)] px-4 py-3 text-sm text-[var(--foreground-muted)]">
                Reporting period
                <strong className="ml-2 text-[var(--foreground-strong)]">{periodLabel}</strong>
              </div>
            </div>
          </section>

          {errorMessage ? (
            <div className="rounded-xl border border-[color-mix(in_srgb,var(--danger)_30%,var(--border))] bg-[var(--danger-soft)] px-4 py-3 text-sm font-medium text-[var(--danger)]">
              {errorMessage}
            </div>
          ) : null}

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Fleet summary">
            <FleetStat label="Fleet machines" value={dashboard.machines.length} detail="Verified registry records" tone="slate" />
            <FleetStat label="Requests" value={dashboard.totalRequests} detail={periodLabel} tone="blue" />
            <FleetStat label="Open requests" value={dashboard.openRequests} detail="Currently active" tone="amber" />
            <FleetStat label="Ready" value={dashboard.readyRequests} detail="Awaiting collection" tone="green" />
          </section>

          <section className="grid min-h-[34rem] gap-4 xl:grid-cols-[minmax(0,1fr)_25rem]">
            <div className="overflow-hidden rounded-[1.1rem] border border-[var(--border)] bg-[var(--background-raised)] shadow-[var(--shadow-sm)]">
              <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--foreground-strong)]">Fleet activity</h2>
                  <p className="mt-1 text-sm text-[var(--foreground-muted)]">Request demand by verified machine</p>
                </div>
                <span className="rounded-full border border-[var(--border)] bg-[var(--background-muted)] px-3 py-1 text-xs font-semibold text-[var(--foreground-muted)]">
                  {filteredMachines.length} machines
                </span>
              </div>

              <div className="max-h-[42rem] overflow-auto">
                {isLoading ? (
                  <div className="p-6 text-sm text-[var(--foreground-muted)]">Loading fleet records...</div>
                ) : filteredMachines.length === 0 ? (
                  <div className="p-6 text-sm text-[var(--foreground-muted)]">No machines match the current search.</div>
                ) : (
                  <div className="divide-y divide-[var(--border)]">
                    {filteredMachines.map((machine) => (
                      <MachineRow
                        key={machine.id}
                        machine={machine}
                        selected={machine.machine_number_normalized === selectedMachine?.machine_number_normalized}
                        periodLabel={periodLabel}
                        onSelect={() => setSelectedMachineKey(machine.machine_number_normalized)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            <aside className="rounded-[1.1rem] border border-[var(--border)] bg-[var(--background-raised)] shadow-[var(--shadow-sm)] xl:sticky xl:top-[6rem] xl:h-fit">
              {selectedMachine ? (
                <MachineDetail machine={selectedMachine} periodLabel={periodLabel} />
              ) : (
                <div className="p-6 text-sm text-[var(--foreground-muted)]">Select a machine to view its request history.</div>
              )}
            </aside>
          </section>
        </div>
      </ConsoleShell>
    </AuthGuard>
  );
}

function FleetStat({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: number;
  detail: string;
  tone: "slate" | "blue" | "amber" | "green";
}) {
  const accent = {
    slate: "bg-slate-500",
    blue: "bg-blue-500",
    amber: "bg-amber-500",
    green: "bg-emerald-500",
  }[tone];

  return (
    <article className="relative overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background-raised)] p-5 shadow-[var(--shadow-sm)]">
      <span className={`absolute inset-y-0 left-0 w-1 ${accent}`} />
      <p className="text-sm font-semibold text-[var(--foreground-muted)]">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[var(--foreground-strong)]">{value}</p>
      <p className="mt-1 text-xs text-[var(--foreground-subtle)]">{detail}</p>
    </article>
  );
}

function MachineRow({
  machine,
  selected,
  periodLabel,
  onSelect,
}: {
  machine: CustomerFleetMachineSummary;
  selected: boolean;
  periodLabel: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`grid w-full gap-4 px-5 py-4 text-left transition sm:grid-cols-[6rem_minmax(0,1fr)_7rem_7rem] sm:items-center ${
        selected
          ? "bg-[color-mix(in_srgb,var(--accent)_8%,var(--background-raised))] shadow-[inset_3px_0_0_var(--accent)]"
          : "hover:bg-[var(--background-muted)]"
      }`}
    >
      <div>
        <p className="text-xs font-semibold text-[var(--foreground-subtle)]">Fleet ref</p>
        <p className="mt-1 text-xl font-semibold text-[var(--foreground-strong)]">{machine.machine_number}</p>
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-[var(--foreground-strong)]">
          {[machine.make, machine.model].filter(Boolean).join(" ") || machine.item_description || "Machine details unavailable"}
        </p>
        <p className="mt-1 truncate text-xs text-[var(--foreground-muted)]">
          Serial {machine.serial_number || "not recorded"} · {formatFleetType(machine.fleet_type)}
        </p>
      </div>
      <div>
        <p className="text-2xl font-semibold text-[var(--foreground-strong)]">{machine.request_count}</p>
        <p className="text-xs text-[var(--foreground-subtle)]">{periodLabel.toLowerCase()}</p>
      </div>
      <div>
        <p className="text-sm font-semibold text-[var(--foreground-strong)]">{machine.open_request_count} open</p>
        <p className="mt-1 text-xs text-[var(--foreground-subtle)]">Last {formatDate(machine.last_request_at)}</p>
      </div>
    </button>
  );
}

function MachineDetail({ machine, periodLabel }: { machine: CustomerFleetMachineSummary; periodLabel: string }) {
  return (
    <div>
      <div className="border-b border-[var(--border)] p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--foreground-subtle)]">Fleet reference</p>
        <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[var(--foreground-strong)]">{machine.machine_number}</p>
        <p className="mt-2 text-sm font-semibold text-[var(--foreground-strong)]">
          {[machine.make, machine.model].filter(Boolean).join(" ") || "Machine details unavailable"}
        </p>
        <p className="mt-1 text-sm text-[var(--foreground-muted)]">Serial {machine.serial_number || "not recorded"}</p>
      </div>

      <dl className="grid grid-cols-2 gap-px bg-[var(--border)]">
        <DetailMetric label="Requests" value={String(machine.request_count)} detail={periodLabel} />
        <DetailMetric label="Open" value={String(machine.open_request_count)} detail={`${machine.ready_request_count} ready`} />
      </dl>

      <div className="p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--foreground-subtle)]">Machine record</p>
        <p className="mt-2 text-sm leading-6 text-[var(--foreground-muted)]">{machine.item_description || "No additional details recorded."}</p>

        <div className="mt-6 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-[var(--foreground-strong)]">Recent requests</h3>
          <span className="text-xs text-[var(--foreground-subtle)]">Visible to this login</span>
        </div>

        <div className="mt-3 space-y-2">
          {machine.recent_requests.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--background-muted)] p-4 text-sm text-[var(--foreground-muted)]">
              No requests are recorded for this machine under this account.
            </div>
          ) : (
            machine.recent_requests.map((ticket) => (
              <Link
                key={ticket.id}
                href={`/tickets/${ticket.id}`}
                className="block rounded-xl border border-[var(--border)] bg-[var(--background-muted)] p-3 transition hover:border-[var(--border-strong)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--foreground-strong)]">Job {ticket.job_number || "not assigned"}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--foreground-muted)]">
                      {ticket.request_summary || ticket.request_details || "No request summary"}
                    </p>
                  </div>
                  <StatusBadge status={ticket.status || "PENDING"} />
                </div>
                <p className="mt-2 text-xs text-[var(--foreground-subtle)]">Raised {formatDate(ticket.created_at)}</p>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function DetailMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="bg-[var(--background-raised)] p-4">
      <dt className="text-xs text-[var(--foreground-subtle)]">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold text-[var(--foreground-strong)]">{value}</dd>
      <p className="mt-1 text-xs text-[var(--foreground-subtle)]">{detail}</p>
    </div>
  );
}

function formatFleetType(value: string | null) {
  if (!value) {
    return "Fleet equipment";
  }

  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDate(value: string | null) {
  if (!value) {
    return "no requests";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
