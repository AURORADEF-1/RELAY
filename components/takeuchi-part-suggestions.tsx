"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildHistoricalPartSuggestions,
  type HistoricalPartSuggestion,
} from "@/lib/historical-part-suggestions";
import { normalizeMachineNumber } from "@/lib/machine-registry";
import {
  fetchPartsLookupCandidates,
  type PartsLookupRecord,
} from "@/lib/parts-lookup";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import { getSupabaseClient } from "@/lib/supabase";
import {
  buildTakeuchiPartSuggestions,
  fetchTakeuchiPartsCatalog,
  normalizeSearchText,
  normalizeTakeuchiModel,
  parseTakeuchiSerialNumber,
  type TakeuchiPartCatalogRecord,
} from "@/lib/takeuchi-parts-catalog";

type TicketMachineContext = {
  ticket_id?: string | null;
  machine_number?: string | null;
  machine_number_normalized?: string | null;
  machine_reference?: string | null;
  machine_make?: string | null;
  machine_model?: string | null;
  machine_serial_number?: string | null;
  machine_verified?: boolean | null;
  request_summary?: string | null;
  request_details?: string | null;
};

export type TicketPartSuggestion = {
  part_description: string;
  part_number: string;
  suggested_part_number?: string | null;
  source_label: string;
  evidence: string;
};

export function TakeuchiPartSuggestions({
  ticket,
  isAdmin,
  onApplySuggestion,
}: {
  ticket: TicketMachineContext;
  isAdmin: boolean;
  onApplySuggestion: (part: TicketPartSuggestion) => void;
}) {
  const [history, setHistory] = useState<PartsLookupRecord[]>([]);
  const [catalog, setCatalog] = useState<TakeuchiPartCatalogRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const machineModel = ticket.machine_model?.trim() ?? "";
  const machineMake = ticket.machine_make?.trim() ?? "";
  const serialNumber = ticket.machine_serial_number?.trim() ?? "";
  const machineNumberNormalized =
    ticket.machine_number_normalized?.trim() ||
    normalizeMachineNumber(ticket.machine_number || ticket.machine_reference || "");
  const normalizedModel = normalizeTakeuchiModel(machineModel || machineMake);
  const parsedSerial = parseTakeuchiSerialNumber(serialNumber);
  const isTakeuchiMachine =
    normalizedModel.startsWith("TB") ||
    normalizedModel.includes("TAKEUCHI") ||
    machineMake.toLowerCase().includes("takeuchi");
  const requestContext = [ticket.request_summary, ticket.request_details].filter(Boolean).join(" ");
  const lookupMachineModel =
    normalizedModel === "TAKEUCHI" || !normalizedModel ? null : machineModel || machineMake;

  const loadSuggestions = useCallback(async () => {
    const supabase = getSupabaseClient();

    if (!supabase) {
      setErrorMessage("Supabase environment variables are not configured.");
      setIsLoading(false);
      return;
    }

    if (!isAdmin) {
      setHistory([]);
      setCatalog([]);
      setErrorMessage("Admin access is required for parts suggestions.");
      setIsLoading(false);
      return;
    }

    if (!ticket.machine_verified) {
      setHistory([]);
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
        setHistory([]);
        setCatalog([]);
        setErrorMessage("Admin access is required for parts suggestions.");
        return;
      }

      const historyPromise = fetchPartsLookupCandidates(supabase, {
        machineNumberNormalized,
        machineMake,
        machineModel,
      });
      const catalogPromise =
        isTakeuchiMachine && parsedSerial !== null
          ? loadTakeuchiCatalog(supabase, lookupMachineModel, serialNumber)
          : Promise.resolve([]);
      const [historyResult, catalogResult] = await Promise.allSettled([historyPromise, catalogPromise]);
      const failures: string[] = [];

      if (historyResult.status === "fulfilled") {
        setHistory(historyResult.value);
      } else {
        setHistory([]);
        failures.push(`RELAY history unavailable: ${formatSuggestionError(historyResult.reason)}`);
      }

      if (catalogResult.status === "fulfilled") {
        setCatalog(catalogResult.value);
      } else {
        setCatalog([]);
        failures.push(`Takeuchi catalogue unavailable: ${formatSuggestionError(catalogResult.reason)}`);
      }

      setErrorMessage(failures.join(" "));
    } catch (error) {
      setHistory([]);
      setCatalog([]);
      setErrorMessage(formatSuggestionError(error));
    } finally {
      setIsLoading(false);
    }
  }, [
    isAdmin,
    isTakeuchiMachine,
    lookupMachineModel,
    machineMake,
    machineModel,
    machineNumberNormalized,
    parsedSerial,
    serialNumber,
    ticket.machine_verified,
  ]);

  useEffect(() => {
    void loadSuggestions();
  }, [loadSuggestions]);

  const activeQuery = searchTerm.trim() || requestContext;
  const historicalSuggestions = useMemo(
    () =>
      buildHistoricalPartSuggestions(
        history.filter((record) => record.ticket_id !== ticket.ticket_id),
        {
          machineNumber: ticket.machine_number,
          machineNumberNormalized,
          machineReference: ticket.machine_reference,
          machineMake,
          machineModel,
          machineSerialNumber: serialNumber,
        },
        activeQuery,
        { limit: 8 },
      ),
    [
      activeQuery,
      history,
      machineMake,
      machineModel,
      machineNumberNormalized,
      serialNumber,
      ticket.machine_number,
      ticket.machine_reference,
      ticket.ticket_id,
    ],
  );
  const catalogueSuggestions = useMemo(() => {
    const query = normalizeSearchText(activeQuery);

    if (!query) {
      return catalog.slice(0, 8).map((part) => ({
        ...part,
        matchScore: 1,
        matchReason: "Catalogue entry",
      }));
    }

    return buildTakeuchiPartSuggestions(catalog, query, { limit: 8 });
  }, [activeQuery, catalog]);

  if (!isAdmin) {
    return null;
  }

  if (!ticket.machine_verified) {
    return (
      <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-500">
        Verify the machine first to unlock exact-machine, model-history, serial-family and catalogue suggestions.
      </div>
    );
  }

  const suggestionCount = historicalSuggestions.length + catalogueSuggestions.length;

  return (
    <section className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-sky-800">
            RELAY parts suggestions
          </p>
          <h4 className="mt-1 text-lg font-semibold text-slate-950">
            Ranked evidence for this verified machine
          </h4>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-700">
            RELAY checks prior parts used on this fleet number, verified machines with the same make and model,
            serial-family proximity and the ticket description. Catalogue suggestions remain separate and are never automatically verified.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-800">Exact machine history</span>
            <span className="rounded-full border border-sky-200 bg-white px-3 py-1 text-sky-800">Same model and serial family</span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700">Same model history</span>
            {isTakeuchiMachine ? (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-800">Takeuchi catalogue</span>
            ) : null}
          </div>
        </div>
        <div className="min-w-24 rounded-xl border border-sky-200 bg-white px-4 py-3 text-right">
          <p className="text-xs font-semibold text-sky-700">Matches</p>
          <p className="mt-1 text-2xl font-semibold text-slate-950">{suggestionCount}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <label className="block text-sm font-medium text-slate-700">
          Refine by part description or number
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="service kit, round vent, deadman cable..."
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-500"
          />
        </label>
        <div className="rounded-xl border border-sky-200 bg-white px-4 py-3 text-sm text-slate-600">
          <p className="font-semibold text-slate-800">Local semantic matching</p>
          <p className="mt-1 leading-6">Workshop synonyms are matched in the browser. No paid AI request is made.</p>
        </div>
      </div>

      {!serialNumber ? (
        <p className="mt-3 text-sm text-slate-600">
          Add the machine serial number to improve same-model confidence and enable compatible catalogue ranges.
        </p>
      ) : null}

      {errorMessage ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {errorMessage}
        </div>
      ) : null}

      {isLoading ? (
        <div className="mt-4 rounded-xl border border-sky-200 bg-white px-4 py-6 text-sm text-slate-500">
          Checking verified machine and parts history...
        </div>
      ) : suggestionCount === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-sky-200 bg-white px-4 py-6 text-sm text-slate-500">
          No sufficiently close historical or catalogue evidence was found. Try a clearer part description; RELAY will not guess a part number.
        </div>
      ) : (
        <div className="mt-4 grid gap-4">
          {historicalSuggestions.length > 0 ? (
            <SuggestionGroup title="Recorded RELAY history" count={historicalSuggestions.length}>
              {historicalSuggestions.map((part) => (
                <HistoricalSuggestionCard key={part.id} part={part} onApplySuggestion={onApplySuggestion} />
              ))}
            </SuggestionGroup>
          ) : null}

          {catalogueSuggestions.length > 0 ? (
            <SuggestionGroup title="Manufacturer catalogue" count={catalogueSuggestions.length}>
              {catalogueSuggestions.map((part) => (
                <article key={part.id} className="rounded-xl border border-amber-200 bg-white p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <p className="text-base font-semibold text-slate-950">{part.suggested_part_number || part.part_number}</p>
                      <p className="mt-1 text-sm text-slate-700">{part.part_description}</p>
                      <p className="mt-2 text-sm text-slate-500">
                        {part.machine_model} · Serial {part.serial_start}-{part.serial_end === 999999999 ? "onwards" : part.serial_end} · {part.bom_main_group} · {part.bom_sub_group}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                        {part.matchReason}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          onApplySuggestion({
                            part_description: part.part_description,
                            part_number: part.part_number,
                            suggested_part_number: part.suggested_part_number,
                            source_label: "Takeuchi catalogue",
                            evidence: `${part.machine_model} serial ${part.serial_start}-${part.serial_end}`,
                          })
                        }
                        className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800"
                      >
                        Use suggestion
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </SuggestionGroup>
          ) : null}
        </div>
      )}
    </section>
  );
}

function SuggestionGroup({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h5 className="text-sm font-semibold text-slate-900">{title}</h5>
        <span className="text-xs font-semibold text-slate-500">{count} result{count === 1 ? "" : "s"}</span>
      </div>
      <div className="grid gap-3">{children}</div>
    </section>
  );
}

function HistoricalSuggestionCard({
  part,
  onApplySuggestion,
}: {
  part: HistoricalPartSuggestion;
  onApplySuggestion: (part: TicketPartSuggestion) => void;
}) {
  const confidenceClass =
    part.confidence === "High"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : part.confidence === "Medium"
        ? "border-sky-200 bg-sky-50 text-sky-800"
        : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-semibold text-slate-950">{part.partNumber}</p>
            <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${confidenceClass}`}>
              {part.confidence} confidence
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-700">{part.description}</p>
          <p className="mt-2 text-sm leading-6 text-slate-500">{part.evidenceDetail}</p>
          <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate-600">
            {part.supplierName ? <span>Supplier: {part.supplierName}</span> : null}
            {part.ticketId ? (
              <Link href={`/tickets/${part.ticketId}`} className="font-semibold text-slate-900 underline decoration-slate-300 underline-offset-4">
                Open previous ticket
              </Link>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
            {part.evidenceSource}
          </span>
          <button
            type="button"
            onClick={() =>
              onApplySuggestion({
                part_description: part.description,
                part_number: part.partNumber,
                source_label: part.evidenceSource,
                evidence: part.evidenceDetail,
              })
            }
            className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Use suggestion
          </button>
        </div>
      </div>
    </article>
  );
}

async function loadTakeuchiCatalog(
  supabase: NonNullable<ReturnType<typeof getSupabaseClient>>,
  machineModel: string | null,
  serialNumber: string,
) {
  const rows = await fetchTakeuchiPartsCatalog(supabase, {
    machineModel,
    serialNumber,
  });

  if (rows.length === 0 && machineModel) {
    return fetchTakeuchiPartsCatalog(supabase, {
      machineModel: null,
      serialNumber,
    });
  }

  return rows;
}

function formatSuggestionError(error: unknown) {
  return error instanceof Error ? error.message : "Unable to load parts suggestions.";
}
