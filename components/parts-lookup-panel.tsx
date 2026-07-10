"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import { fetchPartsLookup, type PartsLookupRecord } from "@/lib/parts-lookup";
import { getSupabaseClient } from "@/lib/supabase";

const PARTS_LOOKUP_MIGRATION_HINT = "Apply docs/parts-lookup-schema.sql and try again.";

export function PartsLookupPanel() {
  const [records, setRecords] = useState<PartsLookupRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const loadPartsLookup = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    const supabase = getSupabaseClient();

    if (!supabase) {
      setErrorMessage("Supabase environment variables are not configured.");
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    if (!silent) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    setErrorMessage("");

    try {
      const { user, isAdmin } = await getCurrentUserWithRole(supabase, {
        forceFresh: true,
      });

      if (!user || !isAdmin) {
        setRecords([]);
        setErrorMessage("Admin access is required for parts lookup.");
        return;
      }

      const lookupRows = await fetchPartsLookup(supabase);
      setRecords(lookupRows);
    } catch (error) {
      setRecords([]);
      setErrorMessage(formatPartsLookupError(error));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadPartsLookup();
  }, [loadPartsLookup]);

  const visibleRecords = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    if (!normalizedSearch) {
      return records;
    }

    return records.filter((record) => {
      const haystack = [
        record.job_number,
        record.machine_number,
        record.machine_reference,
        record.machine_model,
        record.machine_serial_number,
        record.part_description,
        record.part_number,
        record.supplier_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [records, searchTerm]);

  const metrics = useMemo(() => {
    const machines = new Set<string>();
    const parts = new Set<string>();

    for (const record of records) {
      const machineKey =
        record.machine_number_normalized?.trim() ||
        record.machine_reference?.trim() ||
        record.ticket_id;

      if (machineKey) {
        machines.add(machineKey);
      }

      if (record.part_number.trim()) {
        parts.add(record.part_number.trim());
      }
    }

    return {
      total: records.length,
      machines: machines.size,
      uniqueParts: parts.size,
      withSerials: records.filter((record) => record.machine_serial_number?.trim()).length,
    };
  }, [records]);

  return (
    <section className="rounded-3xl border border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
            Parts Lookup
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">
            Machine-linked part register
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            This view reads the assigned part catalogue and shows the machine identity, part description, part number, and linked job in one place.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void loadPartsLookup({ silent: true })}
            disabled={isLoading || isRefreshing}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading || isRefreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {errorMessage ? (
        <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {errorMessage.includes("parts_lookup") ? PARTS_LOOKUP_MIGRATION_HINT : errorMessage}
        </div>
      ) : null}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <LookupStat label="Lookup Rows" value={String(metrics.total)} helper="Assigned part records in the catalogue" />
        <LookupStat label="Machines" value={String(metrics.machines)} helper="Unique machine assignments" />
        <LookupStat label="Part Numbers" value={String(metrics.uniqueParts)} helper="Distinct part numbers captured" />
        <LookupStat label="With Serials" value={String(metrics.withSerials)} helper="Rows carrying serial numbers" />
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
        <label className="block text-sm font-medium text-slate-700">
          Search
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search fleet number, model, serial, part number, description, or job"
            className="mt-2 w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400"
          />
        </label>
      </div>

      <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left">
            <thead className="bg-slate-50">
              <tr className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                <th className="px-4 py-3">Machine</th>
                <th className="px-4 py-3">Model / Serial</th>
                <th className="px-4 py-3">Part</th>
                <th className="px-4 py-3">Job</th>
                <th className="px-4 py-3">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td className="px-4 py-6 text-sm text-slate-500" colSpan={5}>
                    Loading parts lookup...
                  </td>
                </tr>
              ) : visibleRecords.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-sm text-slate-500" colSpan={5}>
                    No parts lookup rows match the current filter.
                  </td>
                </tr>
              ) : (
                visibleRecords.map((record) => {
                  const machineLabel =
                    record.machine_number?.trim() ||
                    record.machine_reference?.trim() ||
                    "Unassigned machine";
                  const machineSubline = [
                    record.machine_fleet_type?.trim(),
                    record.machine_number_normalized?.trim(),
                  ]
                    .filter(Boolean)
                    .join(" · ");

                  return (
                    <tr key={record.id} className="align-top">
                      <td className="px-4 py-4">
                        <div className="text-sm font-semibold text-slate-950">{machineLabel}</div>
                        {machineSubline ? (
                          <div className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                            {machineSubline}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-600">
                        <div className="font-medium text-slate-900">
                          {record.machine_model?.trim() || "No model"}
                        </div>
                        <div className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                          {record.machine_serial_number?.trim() || "No serial number"}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-600">
                        <div className="font-medium text-slate-900">{record.part_description}</div>
                        <div className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                          Part {record.part_number}
                          {record.quantity > 1 ? ` · Qty ${record.quantity}` : ""}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-600">
                        <Link
                          href={`/tickets/${record.ticket_id}`}
                          className="font-medium text-slate-900 transition hover:text-slate-700"
                        >
                          {record.job_number?.trim() ? `Job ${record.job_number.trim()}` : "Open ticket"}
                        </Link>
                        {record.ticket_purchase_order_id ? (
                          <div className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                            Linked to PO
                          </div>
                        ) : (
                          <div className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                            No PO link
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-600">
                        <div className="font-medium text-slate-900">
                          {record.supplier_name?.trim() || "No supplier"}
                        </div>
                        <div className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                          Updated {formatLookupDate(record.updated_at)}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function LookupStat({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-950">{value}</div>
      <div className="mt-1 text-sm leading-6 text-slate-500">{helper}</div>
    </article>
  );
}

function formatLookupDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "recently";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatPartsLookupError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unable to load parts lookup.";

  if (message.toLowerCase().includes("parts_lookup")) {
    return `${PARTS_LOOKUP_MIGRATION_HINT} (${message})`;
  }

  return message;
}
