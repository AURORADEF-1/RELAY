"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import {
  buildTakeuchiPartSuggestions,
  fetchTakeuchiPartsCatalog,
  normalizeSearchText,
  normalizeTakeuchiModel,
  parseTakeuchiSerialNumber,
  type TakeuchiPartCatalogRecord,
} from "@/lib/takeuchi-parts-catalog";
import { getSupabaseClient } from "@/lib/supabase";

type TakeuchiTicketContext = {
  machine_make?: string | null;
  machine_model?: string | null;
  machine_serial_number?: string | null;
  machine_verified?: boolean | null;
  request_summary?: string | null;
  request_details?: string | null;
};

export function TakeuchiPartSuggestions({
  ticket,
  isAdmin,
  onApplySuggestion,
}: {
  ticket: TakeuchiTicketContext;
  isAdmin: boolean;
  onApplySuggestion: (part: TakeuchiPartCatalogRecord) => void;
}) {
  const [catalog, setCatalog] = useState<TakeuchiPartCatalogRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const machineModel = ticket.machine_model?.trim() ?? "";
  const machineMake = ticket.machine_make?.trim() ?? "";
  const serialNumber = ticket.machine_serial_number?.trim() ?? "";
  const normalizedModel = normalizeTakeuchiModel(machineModel || machineMake);
  const parsedSerial = parseTakeuchiSerialNumber(serialNumber);
  const isTakeuchiMachine =
    normalizedModel.startsWith("TB") || normalizedModel.includes("TAKEUCHI") || machineMake.toLowerCase().includes("takeuchi");
  const requestContext = [ticket.request_summary, ticket.request_details].filter(Boolean).join(" ");
  const lookupMachineModel =
    normalizedModel === "TAKEUCHI" || !normalizedModel ? null : machineModel || machineMake;

  const loadCatalog = useCallback(async () => {
    const supabase = getSupabaseClient();

    if (!supabase) {
      setErrorMessage("Supabase environment variables are not configured.");
      setIsLoading(false);
      return;
    }

    if (!isAdmin) {
      setCatalog([]);
      setErrorMessage("Admin access is required for Takeuchi suggestions.");
      setIsLoading(false);
      return;
    }

    if (!ticket.machine_verified || !isTakeuchiMachine || parsedSerial === null) {
      setCatalog([]);
      setErrorMessage("");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage("");

    try {
      const { user, isAdmin: userIsAdmin } = await getCurrentUserWithRole(supabase, {
        forceFresh: true,
      });

      if (!user || !userIsAdmin) {
        setCatalog([]);
        setErrorMessage("Admin access is required for Takeuchi suggestions.");
        return;
      }

      const rows = await fetchTakeuchiPartsCatalog(supabase, {
        machineModel: lookupMachineModel,
        serialNumber,
      });
      if (rows.length === 0 && lookupMachineModel) {
        const serialOnlyRows = await fetchTakeuchiPartsCatalog(supabase, {
          machineModel: null,
          serialNumber,
        });
        setCatalog(serialOnlyRows);
      } else {
        setCatalog(rows);
      }
    } catch (error) {
      setCatalog([]);
      setErrorMessage(formatTakeuchiSuggestionError(error));
    } finally {
      setIsLoading(false);
    }
  }, [
    isAdmin,
    isTakeuchiMachine,
    lookupMachineModel,
    parsedSerial,
    serialNumber,
    ticket.machine_verified,
  ]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const visibleSuggestions = useMemo(() => {
    const query = normalizeSearchText(searchTerm) || normalizeSearchText(requestContext);
    if (!query) {
      return catalog.slice(0, 12).map((part) => ({
        ...part,
        matchScore: 1,
        matchReason: "Catalogue entry",
      }));
    }

    return buildTakeuchiPartSuggestions(catalog, query, { limit: 12 });
  }, [catalog, requestContext, searchTerm]);

  if (!isAdmin) {
    return null;
  }

  if (!ticket.machine_verified) {
    return (
      <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-500">
        Verify the machine first, then Takeuchi BOM suggestions will appear here.
      </div>
    );
  }

  if (!isTakeuchiMachine) {
    return null;
  }

  if (parsedSerial === null) {
    return (
      <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-500">
        Add a machine serial number to unlock Takeuchi serial-range matching.
      </div>
    );
  }

  return (
    <section className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-800">
            Takeuchi BOM lookup
          </p>
          <h4 className="mt-1 text-lg font-semibold text-slate-950">
            Suggested parts for the verified machine
          </h4>
          <p className="mt-1 text-sm leading-6 text-slate-700">
            Serial {serialNumber || "-"} matches the imported catalogue for {machineModel || machineMake || "this machine"}.
            Search by description, BOM main group, or subgroup, then drop the part into the ticket form.
          </p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-white px-4 py-3 text-right">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
            Matches
          </p>
          <p className="mt-1 text-2xl font-semibold text-slate-950">{visibleSuggestions.length}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_260px]">
        <label className="block text-sm font-medium text-slate-700">
          Search description, BOM item, main group, or part number
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="track idler, undercarriage, hydraulic..."
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400"
          />
        </label>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Zero-cost smart lookup</p>
          <p className="mt-1 leading-6">
            Matches workshop terms and catalogue synonyms locally. No paid AI request is made.
          </p>
        </div>
      </div>

      {errorMessage ? (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3">
        {isLoading ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
            Loading Takeuchi suggestions...
          </div>
        ) : visibleSuggestions.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
            No Takeuchi catalogue rows match this machine yet.
          </div>
        ) : (
          visibleSuggestions.map((part) => (
            <article
              key={part.id}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-950">
                    {part.suggested_part_number || part.part_number}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {part.bom_main_group} · {part.bom_sub_group}
                  </p>
                  <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                    {part.part_description}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-800">
                    {part.matchReason}
                  </span>
                  <button
                    type="button"
                    onClick={() => onApplySuggestion(part)}
                    className="inline-flex h-9 items-center justify-center rounded-full border border-slate-300 bg-slate-950 px-3 text-xs font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-slate-800"
                  >
                    Use suggestion
                  </button>
                </div>
              </div>
              <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                <p>
                  Serial range: <span className="font-medium text-slate-900">{part.serial_start} - {part.serial_end}</span>
                </p>
                <p>
                  Model: <span className="font-medium text-slate-900">{part.machine_model}</span>
                </p>
                <p className="sm:col-span-2">
                  BOM item: <span className="font-medium text-slate-900">{part.bom_item || "-"}</span>
                </p>
                {part.notes ? (
                  <p className="sm:col-span-2 leading-6 text-slate-500">{part.notes}</p>
                ) : null}
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function formatTakeuchiSuggestionError(error: unknown) {
  return error instanceof Error ? error.message : "Unable to load Takeuchi suggestions.";
}
