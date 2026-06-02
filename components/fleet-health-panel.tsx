"use client";

import { useMemo, useState } from "react";
import type { FleetMachineSummary, FleetSummaryMetrics } from "@/lib/fleet-health";

type FleetHealthPanelProps = {
  machines: FleetMachineSummary[];
  summary: FleetSummaryMetrics | null;
  isLoading: boolean;
  errorMessage: string;
  onRefresh: () => void;
};

export function FleetHealthPanel({
  machines,
  summary,
  isLoading,
  errorMessage,
  onRefresh,
}: FleetHealthPanelProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMachineKey, setSelectedMachineKey] = useState<string | null>(null);

  const filteredMachines = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    if (!query) {
      return machines;
    }

    return machines.filter((machine) => {
      return [
        machine.machine_number,
        machine.make,
        machine.model,
        machine.serial_number,
        machine.item_description,
        machine.fleet_type,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [machines, searchTerm]);

  const selectedMachine =
    filteredMachines.find((machine) => machine.machine_number_normalized === selectedMachineKey) ??
    filteredMachines[0] ??
    null;

  return (
    <section className="mt-6 space-y-6">
      <div className="rounded-[2rem] border border-white/70 bg-white/60 p-6 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.45)] backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
              Fleet
            </p>
            <h2 className="text-3xl font-semibold tracking-[-0.04em] text-slate-950">
              Fleet health breakdown
            </h2>
            <p className="max-w-3xl text-sm leading-6 text-slate-600">
              The fleet view groups tickets and workshop incidents by plant number so you can see demand,
              service pressure, and historical cost in one place.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? "Refreshing..." : "Refresh Fleet"}
            </button>
          </div>
        </div>

        {summary ? (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <GlassKpi
              label="Highest Demand"
              value={summary.highestDemand?.machine_number ?? "-"}
              helper={`${summary.highestDemand?.request_count ?? 0} part requests`}
            />
            <GlassKpi
              label="Highest Cost"
              value={summary.highestCost?.machine_number ?? "-"}
              helper={formatCurrency(summary.highestCost?.total_spend ?? 0)}
            />
            <GlassKpi
              label="Most Services"
              value={summary.mostServices?.machine_number ?? "-"}
              helper={`${summary.mostServices?.service_count ?? 0} service events`}
            />
            <GlassKpi
              label="Open Issues"
              value={String(summary.openIssues)}
              helper={`${summary.totalMachines} machines tracked`}
            />
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex-1">
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search plant no, make, model, or serial number"
              className="w-full rounded-2xl border border-slate-300 bg-white/90 px-4 py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-slate-400"
            />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            {filteredMachines.length} result{filteredMachines.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-[2rem] border border-white/70 bg-white/55 p-5 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.45)] backdrop-blur">
          <div className="space-y-1">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
              Plant numbers
            </p>
            <p className="text-sm leading-6 text-slate-500">
              Sorted by demand first, then historical spend.
            </p>
          </div>

          <div className="mt-5 overflow-hidden rounded-[1.5rem] border border-white/70 bg-white/70">
            <div className="max-h-[34rem] overflow-y-auto">
              {filteredMachines.length === 0 ? (
                <div className="p-6 text-sm text-slate-500">
                  No fleet records match the current search.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredMachines.map((machine) => {
                    const active = machine.machine_number_normalized === selectedMachine?.machine_number_normalized;

                    return (
                      <button
                        key={machine.machine_number_normalized}
                        type="button"
                        onClick={() => setSelectedMachineKey(machine.machine_number_normalized)}
                        className={`block w-full text-left transition ${
                          active ? "bg-slate-950 text-white" : "bg-white hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4 px-4 py-4">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className={`text-sm font-semibold ${active ? "text-white" : "text-slate-950"}`}>
                                {machine.machine_number}
                              </p>
                              <span
                                className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${
                                  active
                                    ? "border-white/20 bg-white/10 text-white"
                                    : healthToneClass(machine.health_label)
                                }`}
                              >
                                {machine.health_label}
                              </span>
                            </div>
                            <p className={`mt-1 truncate text-sm ${active ? "text-slate-300" : "text-slate-500"}`}>
                              {machine.make ?? "Unknown make"} {machine.model ? `· ${machine.model}` : ""}
                            </p>
                            <p className={`mt-1 text-xs ${active ? "text-slate-400" : "text-slate-400"}`}>
                              {machine.serial_number ?? "No serial"} · {machine.fleet_type ?? "unknown"}
                            </p>
                          </div>
                          <div className={`text-right ${active ? "text-white" : "text-slate-700"}`}>
                            <p className="text-lg font-semibold">{machine.request_count}</p>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                              requests
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-white/70 bg-white/55 p-5 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.45)] backdrop-blur">
          {selectedMachine ? (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Machine Detail
                  </p>
                  <h3 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
                    {selectedMachine.machine_number}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    {selectedMachine.make ?? "Unknown make"}{selectedMachine.model ? ` · ${selectedMachine.model}` : ""}
                  </p>
                </div>
                <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${healthToneClass(selectedMachine.health_label)}`}>
                  {selectedMachine.health_label}
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <GlassDetail label="Requests" value={String(selectedMachine.request_count)} />
                <GlassDetail label="Services" value={String(selectedMachine.service_count)} />
                <GlassDetail label="Historical Cost" value={formatCurrency(selectedMachine.total_spend)} />
                <GlassDetail label="Open Issues" value={String(selectedMachine.open_issue_count)} />
                <GlassDetail label="Last Request" value={formatDateTime(selectedMachine.last_request_at)} />
                <GlassDetail label="Last Service" value={formatDateTime(selectedMachine.last_service_at)} />
                <GlassDetail label="Serial Number" value={selectedMachine.serial_number} />
                <GlassDetail label="Fleet Type" value={selectedMachine.fleet_type} />
              </div>

              <div className="rounded-[1.5rem] border border-slate-200 bg-white/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Summary
                </p>
                <p className="mt-2 text-sm leading-7 text-slate-600">
                  {selectedMachine.request_count === 0
                    ? "No request history yet."
                    : `This machine has received ${selectedMachine.request_count} part request${selectedMachine.request_count === 1 ? "" : "s"} and ${selectedMachine.service_count} service event${selectedMachine.service_count === 1 ? "" : "s"}.`}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <GlassDetail label="Source Sheet" value={selectedMachine.source_sheet} />
                <GlassDetail
                  label="Source Row"
                  value={selectedMachine.source_row != null ? String(selectedMachine.source_row) : null}
                />
                <GlassDetail
                  label="Item Description"
                  value={selectedMachine.item_description}
                  spanFull
                />
              </div>
            </div>
          ) : (
            <div className="flex h-full min-h-[24rem] items-center justify-center rounded-[1.5rem] border border-dashed border-slate-300 bg-white/70 px-6 text-center text-sm text-slate-500">
              Select a machine to see requests, services, cost, and health details.
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function GlassKpi({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-white/70 bg-white/80 px-4 py-4 shadow-sm backdrop-blur">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-slate-950">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{helper}</p>
    </div>
  );
}

function GlassDetail({
  label,
  value,
  spanFull = false,
}: {
  label: string;
  value: string | null | undefined;
  spanFull?: boolean;
}) {
  return (
    <div className={spanFull ? "sm:col-span-2" : ""}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 rounded-[1.1rem] border border-slate-200 bg-white/80 px-4 py-3 text-sm leading-6 text-slate-700">
        {value || "-"}
      </p>
    </div>
  );
}

function healthToneClass(label: FleetMachineSummary["health_label"]) {
  switch (label) {
    case "Healthy":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "Watch":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "At Risk":
      return "border-orange-200 bg-orange-50 text-orange-700";
    case "Critical":
      return "border-rose-200 bg-rose-50 text-rose-700";
  }
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
