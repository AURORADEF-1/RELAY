"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { SmartSearchResult, SmartSearchScope } from "@/lib/admin-smart-search";

const entityLabels: Record<SmartSearchResult["entity"], string> = {
  ticket: "Tickets",
  order: "Orders",
  message: "Messages",
  incident: "Incidents",
  task: "Tasks",
};

export function AdminSmartSearchPanel({
  query,
  isLoading,
  errorMessage,
  results,
  scope,
  onQueryChange,
  onScopeChange,
  onSearch,
}: {
  query: string;
  isLoading: boolean;
  errorMessage: string;
  results: SmartSearchResult[];
  scope: SmartSearchScope;
  onQueryChange: (value: string) => void;
  onScopeChange: (value: SmartSearchScope) => void;
  onSearch: () => void;
}) {
  const groupedResults = useMemo(() => {
    return results.reduce<Record<string, SmartSearchResult[]>>((accumulator, result) => {
      const key = entityLabels[result.entity];
      accumulator[key] = [...(accumulator[key] ?? []), result];
      return accumulator;
    }, {});
  }, [results]);

  const groupEntries = Object.entries(groupedResults);

  return (
    <section className="mt-6 space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
              Smart Search
            </p>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Search tickets, orders, chat, incidents, and tasks from one place. Results are fetched only on demand, so there is no background load.
            </p>
          </div>
          <div className="flex w-full max-w-3xl gap-3">
            <select
              value={scope}
              onChange={(event) => onScopeChange(event.target.value as SmartSearchScope)}
              className="h-12 rounded-2xl border border-slate-300 bg-white px-4 text-sm text-slate-800 outline-none transition focus:border-slate-400"
            >
              <option value="live">Live Jobs</option>
              <option value="completed">Completed Jobs</option>
            </select>
            <input
              type="search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onSearch();
                }
              }}
              placeholder="Search job number, machine ref, requester, PO, supplier, notes, messages..."
              className="h-12 flex-1 rounded-2xl border border-slate-300 bg-white px-4 text-sm text-slate-800 outline-none transition focus:border-slate-400"
            />
            <button
              type="button"
              onClick={onSearch}
              disabled={isLoading || query.trim().length < 2}
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-300 bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? "Searching..." : "Search"}
            </button>
          </div>
        </div>
        {errorMessage ? (
          <p className="mt-4 text-sm leading-6 text-rose-600">{errorMessage}</p>
        ) : null}
      </div>

      {groupEntries.length === 0 && !isLoading && !errorMessage ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50/80 px-6 py-10 text-sm text-slate-500">
          Enter a search term to look across RELAY data.
        </div>
      ) : null}

      {groupEntries.map(([label, items]) => (
        <section key={label} className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{items.length} result{items.length === 1 ? "" : "s"}</p>
          </div>
          <div className="mt-4 grid gap-3">
            {items.map((result) => (
              <Link
                key={result.id}
                href={result.href}
                className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4 transition hover:border-slate-300 hover:bg-white"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{result.title}</p>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {result.subtitle}
                    </p>
                  </div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                    {result.meta}
                  </p>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600">{result.snippet}</p>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}
