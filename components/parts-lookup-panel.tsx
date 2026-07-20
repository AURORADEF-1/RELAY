"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import { fetchPartsLookup, type PartsLookupRecord } from "@/lib/parts-lookup";
import { getSupabaseClient } from "@/lib/supabase";
import { TakeuchiPartsCatalogPanel } from "@/components/takeuchi-parts-catalog-panel";
import { ConsoleIcon } from "@/components/console/console-icon";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/ui/stat-card";
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
    <section className="parts-knowledge-workspace">
      <PageHeader
        title="Parts Knowledge"
        description="Search verified fitment history and manufacturer catalogue intelligence. Suggested catalogue matches always require confirmation before ordering."
        meta={
          <div className="parts-knowledge-source-key" aria-label="Parts confidence key">
            <span><i className="bg-emerald-500" /> Machine verified</span>
            <span><i className="bg-sky-500" /> Model history</span>
            <span><i className="bg-amber-500" /> Catalogue match</span>
          </div>
        }
        actions={
          <button type="button" onClick={() => void loadPartsLookup({ silent: true })} disabled={isLoading || isRefreshing} className="relay-button relay-button-primary">
            <ConsoleIcon name="refresh" className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            {isLoading || isRefreshing ? "Refreshing" : "Refresh data"}
          </button>
        }
      />

      {errorMessage ? (
        <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {errorMessage.includes("parts_lookup") ? PARTS_LOOKUP_MIGRATION_HINT : errorMessage}
        </div>
      ) : null}

      <div className="relay-stat-grid">
        <StatCard label="Lookup rows" value={String(metrics.total)} context="Assigned part records" tone="slate" />
        <StatCard label="Machines" value={String(metrics.machines)} context="Unique assignments" tone="blue" />
        <StatCard label="Part numbers" value={String(metrics.uniqueParts)} context="Distinct numbers captured" tone="green" />
        <StatCard label="With serials" value={String(metrics.withSerials)} context="Serial-backed records" tone="amber" />
      </div>

      <div className="parts-knowledge-tabs" role="tablist" aria-label="Parts Knowledge workspace">
        <KnowledgeTab id="assist" active={activeView === "assist"} onClick={() => setActiveView("assist")}>Parts Assist</KnowledgeTab>
        <KnowledgeTab id="history" active={activeView === "history"} onClick={() => setActiveView("history")}>Verified History</KnowledgeTab>
        <KnowledgeTab id="catalogue" active={activeView === "catalogue"} onClick={() => setActiveView("catalogue")}>Manufacturer Catalogue</KnowledgeTab>
      </div>

      {activeView === "assist" ? (
        <div id="parts-panel-assist" role="tabpanel" aria-labelledby="parts-tab-assist" className="parts-assist-panel">
          <div className="parts-assist-header">
            <div><h2>Ask Parts Assist</h2>
            <p>
              Try “What is the deadman lever cable for a TB290?” or include an exact machine reference and serial number for stronger evidence.
            </p></div>
            <span className="relay-status-badge">Evidence-led search</span>
          </div>
          <div className="parts-assist-body">
            <div className="parts-assist-command">
              <ConsoleIcon name="search" className="h-5 w-5" />
              <input
                value={assistantQuery}
                onChange={(event) => setAssistantQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void runPartsAssist();
                }}
                placeholder="Ask for a part by machine, model, serial, or description"
                aria-label="Parts Assist query"
              />
              <button
                type="button"
                onClick={() => void runPartsAssist()}
                disabled={isAssistantSearching}
                className="relay-button relay-button-primary"
              >
                {isAssistantSearching ? "Searching..." : "Search knowledge"}
              </button>
            </div>
            <div className="parts-assist-examples"><span>Examples:</span><button type="button" onClick={() => setAssistantQuery("TB290 deadman lever cable")}>TB290 deadman cable</button><button type="button" onClick={() => setAssistantQuery("DX140 aircon compressor")}>DX140 aircon compressor</button></div>

            {assistantAnswer ? (
              <div className="parts-assist-answer">
                {assistantAnswer}
              </div>
            ) : null}

            {assistantResults.length > 0 ? (
              <div className="parts-assist-results">
                {assistantResults.map((result) => (
                  <article key={result.id} className="parts-assist-result">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <ConfidenceBadge source={result.source} />
                      <span className="font-mono text-sm font-semibold text-[color:var(--foreground-strong)]">{result.partNumber}</span>
                    </div>
                    <div className="mt-3 font-medium text-[color:var(--foreground-strong)]">{result.description}</div>
                    <div className="mt-2 text-sm leading-6 text-[color:var(--foreground-muted)]">{result.evidence}</div>
                    {result.href ? <Link href={result.href} className="relay-inline-link mt-3 inline-flex">View source job</Link> : null}
                  </article>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {activeView === "history" ? <div id="parts-panel-history" role="tabpanel" aria-labelledby="parts-tab-history" className="parts-table-panel"><div className="parts-table-toolbar">
        <label className="relay-search-field">
          <ConsoleIcon name="search" className="h-4 w-4" /><span className="sr-only">Search verified history</span>
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search fleet number, model, serial, part number, description, or job"
          />
        </label>
        <span>{visibleRecords.length} record{visibleRecords.length === 1 ? "" : "s"}</span>
      </div>

        <div className="parts-data-table-wrap">
          <table className="parts-data-table">
            <thead>
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
      </div> : null}

      {activeView === "catalogue" ? <div id="parts-panel-catalogue" role="tabpanel" aria-labelledby="parts-tab-catalogue"><TakeuchiPartsCatalogPanel /></div> : null}
    </section>
  );
}

function KnowledgeTab({ id, active, onClick, children }: { id: KnowledgeView; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button id={`parts-tab-${id}`} type="button" role="tab" aria-selected={active} aria-controls={`parts-panel-${id}`} tabIndex={active ? 0 : -1} onClick={onClick}>{children}</button>;
}

function ConfidenceBadge({ source }: { source: KnowledgeResult["source"] }) {
  const style = source === "Machine verified" ? "relay-status-success" : source === "Model history" ? "relay-status-info" : source === "Catalogue match" ? "relay-status-warning" : "";
  return <span className={`relay-status-badge ${style}`}>{source}</span>;
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
