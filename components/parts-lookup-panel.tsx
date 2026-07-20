"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import { fetchPartsLookup, type PartsLookupRecord } from "@/lib/parts-lookup";
import { getSupabaseClient } from "@/lib/supabase";
import { TakeuchiPartsCatalogPanel } from "@/components/takeuchi-parts-catalog-panel";
import {
  fetchTakeuchiPartsCatalog,
  normalizeSearchText,
  scoreTakeuchiPartSuggestion,
  type TakeuchiPartCatalogRecord,
} from "@/lib/takeuchi-parts-catalog";

const PARTS_LOOKUP_MIGRATION_HINT = "Apply docs/parts-lookup-schema.sql and try again.";
type KnowledgeView = "assist" | "history" | "catalogue";

type KnowledgeResult = {
  id: string;
  source: "Machine verified" | "Model history" | "Catalogue match" | "Suggested";
  partNumber: string;
  description: string;
  evidence: string;
  href?: string;
};

export function PartsLookupPanel() {
  const [records, setRecords] = useState<PartsLookupRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [activeView, setActiveView] = useState<KnowledgeView>("assist");
  const [assistantQuery, setAssistantQuery] = useState("");
  const [assistantAnswer, setAssistantAnswer] = useState("");
  const [assistantResults, setAssistantResults] = useState<KnowledgeResult[]>([]);
  const [isAssistantSearching, setIsAssistantSearching] = useState(false);

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

  const runPartsAssist = useCallback(async () => {
    const query = assistantQuery.trim();
    if (!query) {
      setAssistantAnswer("Enter a machine reference or model and the part you need.");
      setAssistantResults([]);
      return;
    }

    setIsAssistantSearching(true);
    setAssistantAnswer("");
    setAssistantResults([]);

    try {
      const normalizedQuery = normalizeSearchText(query);
      const model = extractMachineModel(query);
      const serial = extractSerialNumber(query);
      const queryTerms = buildKnowledgeTerms(normalizedQuery, model);
      const historyMatches = records
        .map((record) => ({ record, ...scoreHistoryRecord(record, normalizedQuery, model, queryTerms) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map(({ record, exactMachine }): KnowledgeResult => ({
          id: `history-${record.id}`,
          source: exactMachine ? "Machine verified" : "Model history",
          partNumber: record.part_number,
          description: record.part_description,
          evidence: [
            record.machine_reference || record.machine_model || "Recorded machine",
            record.job_number ? `Job ${record.job_number}` : null,
            record.supplier_name,
          ].filter(Boolean).join(" · "),
          href: record.ticket_id ? `/tickets/${record.ticket_id}` : undefined,
        }));

      let catalogueMatches: KnowledgeResult[] = [];
      if (model?.toUpperCase().startsWith("TB")) {
        const supabase = getSupabaseClient();
        if (supabase) {
          const catalogue = await fetchTakeuchiPartsCatalog(supabase, {
            machineModel: model,
            serialNumber: serial,
          });
          catalogueMatches = rankCatalogue(catalogue, queryTerms.join(" "), model).slice(0, 5);
        }
      }

      const combined = [...historyMatches, ...catalogueMatches].slice(0, 8);
      setAssistantResults(combined);

      if (combined.length === 0) {
        setAssistantAnswer(
          `No verified part number was found${model ? ` for ${model}` : ""}. Try the exact machine reference, add the serial number, or use a different part description. RELAY will not guess a part number.`,
        );
      } else if (combined[0].source === "Machine verified") {
        setAssistantAnswer("A part previously recorded against the exact machine reference was found. Confirm the evidence below before ordering.");
      } else {
        setAssistantAnswer(
          `RELAY found ${combined.length} possible match${combined.length === 1 ? "" : "es"}. These are ranked evidence, not an automatic fitment guarantee${serial ? "" : "; add the serial number to improve confidence"}.`,
        );
      }
    } catch (error) {
      setAssistantAnswer(formatPartsLookupError(error));
    } finally {
      setIsAssistantSearching(false);
    }
  }, [assistantQuery, records]);

  return (
    <section className="rounded-3xl border border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
            Parts Knowledge
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">
            Verified history, catalogue intelligence, and Parts Assist
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Search parts learned from previous jobs alongside manufacturer catalogue data. Every answer keeps its source and confidence visible so a suggested match cannot be mistaken for a verified part.
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

      <div className="mt-6 flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2">
        <KnowledgeTab active={activeView === "assist"} onClick={() => setActiveView("assist")}>Parts Assist</KnowledgeTab>
        <KnowledgeTab active={activeView === "history"} onClick={() => setActiveView("history")}>Verified History</KnowledgeTab>
        <KnowledgeTab active={activeView === "catalogue"} onClick={() => setActiveView("catalogue")}>Manufacturer Catalogue</KnowledgeTab>
      </div>

      {activeView === "assist" ? (
        <div className="mt-6 overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 text-white shadow-[0_24px_80px_-36px_rgba(15,23,42,0.8)]">
          <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.18),transparent_36%)] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">Parts Assist</p>
            <h3 className="mt-2 text-xl font-semibold">Ask using normal workshop language</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              Try “What is the deadman lever cable for a TB290?” or include an exact machine reference and serial number for stronger evidence.
            </p>
          </div>
          <div className="p-6">
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                value={assistantQuery}
                onChange={(event) => setAssistantQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void runPartsAssist();
                }}
                placeholder="Ask for a part by machine, model, serial, or description"
                className="min-w-0 flex-1 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-400 focus:border-emerald-400"
              />
              <button
                type="button"
                onClick={() => void runPartsAssist()}
                disabled={isAssistantSearching}
                className="rounded-2xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:opacity-60"
              >
                {isAssistantSearching ? "Searching..." : "Search knowledge"}
              </button>
            </div>

            {assistantAnswer ? (
              <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-6 text-slate-200">
                {assistantAnswer}
              </div>
            ) : null}

            {assistantResults.length > 0 ? (
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {assistantResults.map((result) => (
                  <article key={result.id} className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <ConfidenceBadge source={result.source} />
                      <span className="font-mono text-sm font-semibold text-emerald-300">{result.partNumber}</span>
                    </div>
                    <div className="mt-3 font-medium text-white">{result.description}</div>
                    <div className="mt-2 text-xs leading-5 text-slate-400">{result.evidence}</div>
                    {result.href ? <Link href={result.href} className="mt-3 inline-flex text-xs font-semibold text-emerald-300 hover:text-emerald-200">View source job</Link> : null}
                  </article>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {activeView === "history" ? <><div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
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
      </div></> : null}

      {activeView === "catalogue" ? <TakeuchiPartsCatalogPanel /> : null}
    </section>
  );
}

function KnowledgeTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${active ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"}`}>{children}</button>;
}

function ConfidenceBadge({ source }: { source: KnowledgeResult["source"] }) {
  const style = source === "Machine verified" ? "bg-emerald-400/15 text-emerald-300" : source === "Model history" ? "bg-sky-400/15 text-sky-300" : source === "Catalogue match" ? "bg-amber-400/15 text-amber-200" : "bg-white/10 text-slate-300";
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${style}`}>{source}</span>;
}

function extractMachineModel(query: string) {
  return query.match(/\b(?:TB|DX)\s*\d{2,4}(?:LC)?(?:-\d+)?\b/i)?.[0].replace(/\s+/g, "") ?? null;
}

function extractSerialNumber(query: string) {
  return query.match(/\b(?:serial|s\/n|sn)\s*[:#-]?\s*(\d{5,})\b/i)?.[1] ?? null;
}

function buildKnowledgeTerms(query: string, model: string | null) {
  const ignored = new Set(["what", "which", "where", "part", "number", "for", "the", "a", "an", "is", "of", "need", "find", normalizeSearchText(model)]);
  return query.split(" ").filter((term) => term.length > 2 && !ignored.has(term));
}

function scoreHistoryRecord(record: PartsLookupRecord, query: string, model: string | null, terms: string[]) {
  const machine = normalizeSearchText([record.machine_number, record.machine_reference, record.machine_model, record.machine_serial_number].filter(Boolean).join(" "));
  const part = normalizeSearchText([record.part_description, record.part_number, record.notes].filter(Boolean).join(" "));
  const machineIdentifiers = [record.machine_number, record.machine_number_normalized, record.machine_reference]
    .map(normalizeSearchText)
    .filter((value) => value.length >= 4);
  const exactMachine = machineIdentifiers.some((identifier) => query.includes(identifier));
  let score = 0;
  if (query && normalizeSearchText([machine, part].join(" ")).includes(query)) score += 120;
  if (exactMachine) score += 80;
  if (model && machine.includes(normalizeSearchText(model))) score += 35;
  for (const term of terms) {
    if (machine.includes(term)) score += 18;
    if (part.includes(term)) score += 24;
  }
  return { score, exactMachine };
}

function rankCatalogue(catalogue: TakeuchiPartCatalogRecord[], query: string, model: string) {
  return catalogue
    .map((part) => ({ part, score: scoreTakeuchiPartSuggestion(part, query) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ part, score }): KnowledgeResult => ({
      id: `catalogue-${part.id}`,
      source: score >= 45 ? "Catalogue match" : "Suggested",
      partNumber: part.suggested_part_number || part.part_number,
      description: part.part_description || part.bom_sub_group,
      evidence: `${model} · ${part.bom_main_group} · Serial ${part.serial_start}-${part.serial_end === 999999999 ? "onwards" : part.serial_end}`,
    }));
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
