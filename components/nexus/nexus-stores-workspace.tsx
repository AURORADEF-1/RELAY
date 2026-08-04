"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { ConsoleIcon } from "@/components/console/console-icon";
import type {
  NexusCataloguePart,
  NexusCatalogueResponse,
} from "@/lib/integrations/nexus/types";
import type { MachineRegistryRecord } from "@/lib/machine-registry";
import { getSupabaseAccessToken } from "@/lib/supabase";

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

export function NexusStoresWorkspace() {
  const [fleetNumber, setFleetNumber] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [requestId, setRequestId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
    if (!fleetNumber.trim()) return;
    setBusy(true);
    setError("");
    setResult(null);
    setConfirmation(null);
    setQuantities({});
    setConfirmed(false);
    setRequestId(null);
    try {
      const data = await relayRequest<LookupResult>(
        `/api/integrations/nexus/catalogue?fleetNumber=${encodeURIComponent(fleetNumber.trim())}`,
      );
      setResult(data);
    } catch (lookupError) {
      setError(messageFor(lookupError));
    } finally {
      setBusy(false);
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
        <form onSubmit={lookupMachine} className="mt-5 flex max-w-xl gap-2">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Fleet number</span>
            <input
              value={fleetNumber}
              onChange={(event) => setFleetNumber(event.target.value)}
              placeholder="Enter fleet number"
              className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="console-primary-action min-h-11"
          >
            <ConsoleIcon
              name={busy ? "refresh" : "search"}
              className="h-4 w-4"
            />
            {busy ? "Checking…" : "Check fleet"}
          </button>
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

function messageFor(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Unable to complete the request.";
}
