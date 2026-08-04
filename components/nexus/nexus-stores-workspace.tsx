"use client";

import Image from "next/image";
import Link from "next/link";
import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { ConsoleIcon } from "@/components/console/console-icon";
import type {
  NexusCataloguePart,
  NexusCatalogueResponse,
} from "@/lib/integrations/nexus/types";
import type { MachineRegistryRecord } from "@/lib/machine-registry";
import { normalizeMachineNumber } from "@/lib/machine-registry";
import { getSupabaseAccessToken, getSupabaseClient } from "@/lib/supabase";

type LookupResult = {
  machine: MachineRegistryRecord;
  classification: { manufacturer: string; model: string };
  catalogue: NexusCatalogueResponse;
};

type ConfirmationResult = {
  ticketId: string;
  status: "ALLOCATED" | "PARTIAL";
  issuedQuantity: number;
  shortfallQuantity: number;
  shortageNote: string | null;
  allocationId: string;
  idempotent: boolean;
};

type FleetSuggestion = Pick<
  MachineRegistryRecord,
  | "id"
  | "machine_number"
  | "machine_number_normalized"
  | "item_description"
  | "make"
  | "model"
  | "serial_number"
  | "status"
>;

export function NexusStoresWorkspace() {
  const [fleetNumber, setFleetNumber] = useState("");
  const [selectedFleetNumber, setSelectedFleetNumber] = useState("");
  const [fleetSuggestions, setFleetSuggestions] = useState<FleetSuggestion[]>(
    [],
  );
  const [isSuggestionSearchBusy, setIsSuggestionSearchBusy] = useState(false);
  const [hasSearchedSuggestions, setHasSearchedSuggestions] = useState(false);
  const [isSuggestionListOpen, setIsSuggestionListOpen] = useState(false);
  const [highlightedSuggestion, setHighlightedSuggestion] = useState(-1);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [requestId, setRequestId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const suggestionListId = useId();
  const suggestionRequest = useRef(0);

  useEffect(() => {
    const query = fleetNumber.trim();
    const requestNumber = ++suggestionRequest.current;

    if (!query || query === selectedFleetNumber) {
      setFleetSuggestions([]);
      setHasSearchedSuggestions(false);
      setIsSuggestionSearchBusy(false);
      setHighlightedSuggestion(-1);
      return;
    }

    setIsSuggestionSearchBusy(true);
    setHasSearchedSuggestions(false);
    const timeout = window.setTimeout(async () => {
      const supabase = getSupabaseClient();
      if (!supabase) {
        if (requestNumber === suggestionRequest.current) {
          setFleetSuggestions([]);
          setIsSuggestionSearchBusy(false);
          setHasSearchedSuggestions(true);
        }
        return;
      }

      const clean = query.replace(/[%(),]/g, " ").trim();
      const compact = normalizeMachineNumber(query);
      const filters = [
        `machine_number.ilike.*${clean}*`,
        `machine_number_normalized.ilike.*${compact}*`,
        `make.ilike.*${clean}*`,
        `model.ilike.*${clean}*`,
        `serial_number.ilike.*${clean}*`,
        `item_description.ilike.*${clean}*`,
      ];
      const { data } = await supabase
        .from("machines")
        .select(
          "id,machine_number,machine_number_normalized,item_description,make,model,serial_number,status",
        )
        .or(filters.join(","))
        .order("machine_number_normalized", { ascending: true })
        .limit(8);

      if (requestNumber !== suggestionRequest.current) return;
      setFleetSuggestions((data ?? []) as FleetSuggestion[]);
      setIsSuggestionSearchBusy(false);
      setHasSearchedSuggestions(true);
      setIsSuggestionListOpen(true);
      setHighlightedSuggestion(-1);
    }, 240);

    return () => window.clearTimeout(timeout);
  }, [fleetNumber, selectedFleetNumber]);

  const groups = useMemo(() => {
    const grouped = new Map<string, NexusCataloguePart[]>();
    for (const part of result?.catalogue.parts ?? []) {
      grouped.set(part.subgroup, [...(grouped.get(part.subgroup) ?? []), part]);
    }
    return Array.from(grouped, ([subgroup, parts]) => ({
      subgroup,
      parts: parts.toSorted((a, b) => a.partNumber.localeCompare(b.partNumber)),
    })).toSorted((a, b) => a.subgroup.localeCompare(b.subgroup));
  }, [result]);

  const selectedLines = useMemo(
    () =>
      (result?.catalogue.parts ?? []).flatMap((part) => {
        const quantity = quantities[part.id] ?? 0;
        return quantity > 0 ? [{ part, quantity }] : [];
      }),
    [quantities, result],
  );

  async function lookupMachine(event: FormEvent) {
    event.preventDefault();
    await lookupFleetNumber(fleetNumber);
  }

  async function lookupFleetNumber(value: string) {
    const requestedFleetNumber = value.trim();
    if (!requestedFleetNumber) return;
    setFleetNumber(requestedFleetNumber);
    setSelectedFleetNumber(requestedFleetNumber);
    setFleetSuggestions([]);
    setIsSuggestionListOpen(false);
    setHighlightedSuggestion(-1);
    setBusy(true);
    setError("");
    setResult(null);
    setConfirmation(null);
    setQuantities({});
    setConfirmed(false);
    setRequestId(null);
    try {
      const data = await relayRequest<LookupResult>(
        `/api/integrations/nexus/catalogue?fleetNumber=${encodeURIComponent(requestedFleetNumber)}`,
      );
      setResult(data);
    } catch (lookupError) {
      setError(messageFor(lookupError));
    } finally {
      setBusy(false);
    }
  }

  function chooseFleetSuggestion(machine: FleetSuggestion) {
    void lookupFleetNumber(machine.machine_number);
  }

  function handleFleetKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!isSuggestionListOpen || fleetSuggestions.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedSuggestion((current) =>
        current >= fleetSuggestions.length - 1 ? 0 : current + 1,
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedSuggestion((current) =>
        current <= 0 ? fleetSuggestions.length - 1 : current - 1,
      );
      return;
    }

    if (event.key === "Enter" && highlightedSuggestion >= 0) {
      event.preventDefault();
      chooseFleetSuggestion(fleetSuggestions[highlightedSuggestion]);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setIsSuggestionListOpen(false);
      setHighlightedSuggestion(-1);
    }
  }

  async function submitRequest() {
    if (!result || selectedLines.length === 0 || !confirmed) {
      setError("Select at least one part and confirm the stock issue.");
      return;
    }
    const stableRequestId = requestId ?? crypto.randomUUID();
    setRequestId(stableRequestId);
    setBusy(true);
    setError("");
    try {
      const data = await relayRequest<ConfirmationResult>(
        "/api/integrations/nexus/self-service",
        {
          method: "POST",
          body: JSON.stringify({
            requestId: stableRequestId,
            fleetNumber: result.machine.machine_number,
            lines: selectedLines.map(({ part, quantity }) => ({
              partId: part.id,
              quantity,
            })),
            confirmed: true,
          }),
        },
      );
      setConfirmation(data);
    } catch (submitError) {
      setError(messageFor(submitError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
              Verified fleet lookup
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">
              Find machine-specific parts
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Enter a RELAY fleet number. NEXUS will return only parts
              associated with the verified make and model.
            </p>
          </div>
          <span className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
            Admin only
          </span>
        </div>
        <form onSubmit={lookupMachine} className="mt-5 max-w-2xl">
          <label className="block">
            <span className="sr-only">Fleet number</span>
            <span className="relative block">
              <ConsoleIcon
                name={busy || isSuggestionSearchBusy ? "refresh" : "search"}
                className={`pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400 ${busy || isSuggestionSearchBusy ? "animate-spin" : ""}`}
              />
              <input
                value={fleetNumber}
                onChange={(event) => {
                  setFleetNumber(event.target.value);
                  setSelectedFleetNumber("");
                  setIsSuggestionListOpen(true);
                }}
                onFocus={() => {
                  if (fleetSuggestions.length || hasSearchedSuggestions) {
                    setIsSuggestionListOpen(true);
                  }
                }}
                onKeyDown={handleFleetKeyDown}
                placeholder="Start typing a fleet number, make, model or serial"
                autoComplete="off"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={isSuggestionListOpen}
                aria-controls={suggestionListId}
                aria-activedescendant={
                  highlightedSuggestion >= 0
                    ? `${suggestionListId}-${highlightedSuggestion}`
                    : undefined
                }
                className="h-11 w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-24 text-sm text-slate-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                Press Enter
              </span>
            </span>
          </label>

          {isSuggestionListOpen && fleetNumber.trim() ? (
            <div
              id={suggestionListId}
              role="listbox"
              aria-label="Matching RELAY fleet machines"
              className="mt-2 max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg"
            >
              {isSuggestionSearchBusy ? (
                <p className="px-3 py-3 text-sm text-slate-500">
                  Searching RELAY fleet…
                </p>
              ) : fleetSuggestions.length ? (
                fleetSuggestions.map((machine, index) => (
                  <button
                    key={machine.id ?? machine.machine_number_normalized}
                    id={`${suggestionListId}-${index}`}
                    type="button"
                    role="option"
                    aria-selected={highlightedSuggestion === index}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setHighlightedSuggestion(index)}
                    onClick={() => chooseFleetSuggestion(machine)}
                    className={`flex w-full items-center justify-between gap-4 rounded-lg px-3 py-2.5 text-left transition ${highlightedSuggestion === index ? "bg-emerald-50" : "hover:bg-slate-50"}`}
                  >
                    <span className="min-w-0">
                      <strong className="block font-mono text-sm text-emerald-800">
                        {machine.machine_number}
                      </strong>
                      <span className="mt-0.5 block truncate text-xs text-slate-500">
                        {fleetSuggestionDescription(machine)}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-slate-400">
                      Select
                    </span>
                  </button>
                ))
              ) : hasSearchedSuggestions ? (
                <p className="px-3 py-3 text-sm text-slate-500">
                  No matching RELAY fleet numbers. Finish typing the exact
                  reference and press Enter to check it.
                </p>
              ) : null}
            </div>
          ) : null}
          <p className="mt-2 text-xs text-slate-500">
            Choose a predictive result, or type the complete fleet number and
            press Enter.
          </p>
        </form>
      </section>

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          {error}
        </div>
      ) : null}

      {result ? (
        <>
          <section className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  RELAY fleet verified
                </p>
                <p className="mt-1 text-lg font-semibold text-emerald-950">
                  {result.classification.manufacturer} ·{" "}
                  {result.classification.model}
                </p>
              </div>
              <div className="text-right text-sm text-emerald-900">
                <p className="font-semibold">
                  Fleet {result.machine.machine_number}
                </p>
                <p>{result.catalogue.parts.length} matching NEXUS parts</p>
              </div>
            </div>
          </section>

          {groups.length === 0 ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
              <h3 className="font-semibold text-slate-950">
                No associated parts found
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Add {result.classification.manufacturer} ·{" "}
                {result.classification.model} as an application against the
                appropriate parts in NEXUS.
              </p>
            </section>
          ) : (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-4">
                {groups.map((group) => (
                  <section
                    key={group.subgroup}
                    className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                  >
                    <header className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
                      <h3 className="font-semibold text-slate-950">
                        {group.subgroup}
                      </h3>
                      <span className="text-xs text-slate-500">
                        {group.parts.length} part
                        {group.parts.length === 1 ? "" : "s"}
                      </span>
                    </header>
                    <div className="divide-y divide-slate-200">
                      {group.parts.map((part) => (
                        <PartRow
                          key={part.id}
                          part={part}
                          quantity={quantities[part.id] ?? 0}
                          onQuantity={(quantity) =>
                            setQuantities((current) => ({
                              ...current,
                              [part.id]: quantity,
                            }))
                          }
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>

              <aside className="h-fit rounded-xl border border-slate-200 bg-white p-4 xl:sticky xl:top-24">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                  Ticket basket
                </p>
                <h3 className="mt-1 font-semibold text-slate-950">
                  {selectedLines.length} selected part
                  {selectedLines.length === 1 ? "" : "s"}
                </h3>
                <div className="mt-3 space-y-2">
                  {selectedLines.length === 0 ? (
                    <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
                      Enter a requested quantity beside a part.
                    </p>
                  ) : (
                    selectedLines.map(({ part, quantity }) => (
                      <div
                        key={part.id}
                        className="flex justify-between gap-3 text-sm"
                      >
                        <span className="min-w-0 truncate">
                          {part.partNumber}
                        </span>
                        <strong>{quantity} requested</strong>
                      </div>
                    ))
                  )}
                </div>
                <label className="mt-4 flex items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                    className="mt-0.5 size-4 accent-emerald-700"
                  />
                  <span>
                    Confirm creation of a RELAY ticket and immediate NEXUS stock
                    issue. Any shortfall will be recorded for ordering.
                  </span>
                </label>
                <button
                  type="button"
                  disabled={busy || !confirmed || selectedLines.length === 0}
                  onClick={submitRequest}
                  className="console-primary-action mt-4 min-h-11 w-full justify-center"
                >
                  {busy ? "Processing…" : "Confirm and create ticket"}
                </button>
              </aside>
            </div>
          )}
        </>
      ) : null}

      {confirmation ? (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">
            Stores request complete
          </p>
          <h2 className="mt-1 text-xl font-semibold text-emerald-950">
            RELAY ticket created and NEXUS stock updated
          </h2>
          <p className="mt-2 text-sm text-emerald-900">
            {confirmation.issuedQuantity} issued ·{" "}
            {confirmation.shortfallQuantity} to order
          </p>
          {confirmation.shortageNote ? (
            <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-amber-200 bg-amber-50 p-3 font-sans text-sm text-amber-950">
              {confirmation.shortageNote}
            </pre>
          ) : null}
          <Link
            href={`/tickets/${confirmation.ticketId}`}
            className="console-primary-action mt-4 inline-flex"
          >
            Open RELAY ticket
          </Link>
        </section>
      ) : null}
    </div>
  );
}

function PartRow({
  part,
  quantity,
  onQuantity,
}: {
  part: NexusCataloguePart;
  quantity: number;
  onQuantity: (quantity: number) => void;
}) {
  const shortfall = Math.max(0, quantity - part.stockAvailable);
  return (
    <article className="grid gap-3 p-4 sm:grid-cols-[56px_minmax(0,1fr)_120px] sm:items-center">
      <div className="relative size-14 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
        {part.imageUrl ? (
          <Image
            src={part.imageUrl}
            alt=""
            fill
            unoptimized
            sizes="56px"
            className="object-cover"
          />
        ) : (
          <div className="grid h-full place-items-center text-slate-400">
            <ConsoleIcon name="parts" className="h-5 w-5" />
          </div>
        )}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="font-mono text-sm text-emerald-800">
            {part.partNumber}
          </strong>
          <span
            className={`rounded px-2 py-0.5 text-xs font-semibold ${part.stockAvailable > 0 ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}
          >
            {part.stockAvailable} available
          </span>
        </div>
        <p className="mt-1 text-sm font-medium text-slate-950">
          {part.description}
        </p>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          <span>Bin {part.binLocation}</span>
          <span>{formatMoney(part.sellPrice)}</span>
          <span>{formatVerification(part.verificationStatus)}</span>
        </div>
        {shortfall > 0 ? (
          <p className="mt-2 text-xs font-semibold text-amber-700">
            {part.stockAvailable} will issue; order {shortfall} from the{" "}
            {part.manufacturer} manufacturer group.
          </p>
        ) : null}
      </div>
      <label className="text-xs font-semibold text-slate-600">
        Request quantity
        <input
          type="number"
          min={0}
          max={999}
          value={quantity}
          onChange={(event) =>
            onQuantity(
              Math.min(999, Math.max(0, Number(event.target.value) || 0)),
            )
          }
          className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-950 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
        />
      </label>
    </article>
  );
}

async function relayRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const token = await getSupabaseAccessToken();
  if (!token) throw new Error("Sign in with an administrator account.");
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
  const payload = (await response.json().catch(() => ({}))) as {
    data?: T;
    error?: string;
    ticketId?: string;
    retryable?: boolean;
  };
  if (!response.ok || payload.error) {
    const ticketSuffix = payload.ticketId
      ? ` RELAY ticket ${payload.ticketId.slice(0, 8).toUpperCase()} was created; retry this confirmation to finish allocation.`
      : "";
    throw new Error(`${payload.error || "Request failed."}${ticketSuffix}`);
  }
  return payload.data as T;
}

function formatMoney(value: number | null) {
  return value === null
    ? "Price not set"
    : new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "GBP",
      }).format(value);
}

function formatVerification(value: NexusCataloguePart["verificationStatus"]) {
  if (value === "relay_verified") return "RELAY verified";
  if (value === "manufacturer_verified") return "Manufacturer verified";
  if (value === "supplier_verified") return "Supplier verified";
  return "Fitment unverified";
}

function fleetSuggestionDescription(machine: FleetSuggestion) {
  return (
    [
      machine.make,
      machine.model,
      machine.serial_number ? `Serial ${machine.serial_number}` : null,
      machine.item_description,
    ]
      .filter(Boolean)
      .join(" · ") || "Registered RELAY machine"
  );
}

function messageFor(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Unable to complete the request.";
}
