"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchLatestTicketLabelBatch,
  verifyPartLabel,
  type PartLabelValidationRecord,
} from "@/lib/part-label-validation";
import { getSupabaseClient } from "@/lib/supabase";

export function PartLabelValidationPanel({
  ticketId,
  ticketStatus,
}: {
  ticketId: string;
  ticketStatus: string;
}) {
  const [labels, setLabels] = useState<PartLabelValidationRecord[]>([]);
  const [scanValue, setScanValue] = useState("");
  const [notice, setNotice] = useState("");
  const [noticeTone, setNoticeTone] = useState<"green" | "amber" | "red">("amber");
  const [isLoading, setIsLoading] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const loadLabels = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    try {
      setLabels(await fetchLatestTicketLabelBatch(supabase, ticketId));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to load label validation.");
      setNoticeTone("red");
    } finally {
      setIsLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    void loadLabels();
  }, [loadLabels]);

  useEffect(() => {
    const handleUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ ticketId?: string }>).detail;
      if (!detail?.ticketId || detail.ticketId === ticketId) void loadLabels();
    };
    window.addEventListener("relay-label-validation-updated", handleUpdate);
    return () => window.removeEventListener("relay-label-validation-updated", handleUpdate);
  }, [loadLabels, ticketId]);

  const verifiedCount = useMemo(
    () => labels.filter((label) => Boolean(label.verified_at)).length,
    [labels],
  );
  const issuedCount = useMemo(
    () => labels.filter((label) => Boolean(label.issued_at)).length,
    [labels],
  );

  async function handleScan() {
    if (!scanValue.trim() || isVerifying) return;
    const supabase = getSupabaseClient();
    if (!supabase) {
      setNotice("Supabase environment variables are not configured.");
      setNoticeTone("red");
      return;
    }

    setIsVerifying(true);
    try {
      const result = await verifyPartLabel(supabase, scanValue);
      if (result.ticket_id !== ticketId) {
        setNotice(`That label belongs to job ${result.job_number}, not this ticket.`);
        setNoticeTone("amber");
      } else if (!result.is_latest_batch) {
        setNotice("Label recognised, but it belongs to an older READY batch.");
        setNoticeTone("amber");
      } else {
        const part = result.part_number || "general job label";
        setNotice(
          result.already_verified
            ? `${part} · ${result.unit_index} of ${result.unit_total} was already verified.`
            : `${part} · ${result.unit_index} of ${result.unit_total} verified.`,
        );
        setNoticeTone("green");
      }
      setScanValue("");
      await loadLabels();
      inputRef.current?.focus();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to verify this label.");
      setNoticeTone("red");
    } finally {
      setIsVerifying(false);
    }
  }

  if (isLoading) {
    return <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">Loading label validation…</div>;
  }

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">Part-label validation</p>
            <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-amber-800">
              One-month pilot · advisory only
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            Scan each physical label. Missing checks are highlighted but do not block READY, issuing or COMPLETED.
          </p>
        </div>
        <div className="flex gap-2 text-sm font-semibold">
          <span className={verifiedCount === labels.length && labels.length > 0 ? "rounded-full bg-emerald-100 px-3 py-1.5 text-emerald-800" : "rounded-full bg-amber-100 px-3 py-1.5 text-amber-900"}>
            {verifiedCount}/{labels.length} verified
          </span>
          <span className={issuedCount === labels.length && labels.length > 0 ? "rounded-full bg-emerald-100 px-3 py-1.5 text-emerald-800" : "rounded-full bg-slate-200 px-3 py-1.5 text-slate-700"}>
            {issuedCount}/{labels.length} issued
          </span>
        </div>
      </header>

      <div className="p-5">
        {labels.length > 0 ? (
          <>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                ref={inputRef}
                value={scanValue}
                onChange={(event) => setScanValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void handleScan();
                }}
                autoComplete="off"
                placeholder="Scan RLY part label"
                aria-label="Scan RELAY part label"
                className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-3 font-mono text-sm font-semibold uppercase outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
              />
              <button
                type="button"
                onClick={() => void handleScan()}
                disabled={isVerifying || !scanValue.trim()}
                className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isVerifying ? "Checking…" : "Verify label"}
              </button>
            </div>

            {notice ? (
              <p className={`mt-3 rounded-xl border px-4 py-3 text-sm font-semibold ${noticeTone === "green" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : noticeTone === "red" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
                {notice}
              </p>
            ) : null}

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {labels.map((label) => (
                <article
                  key={label.id}
                  className={`rounded-xl border p-3 ${label.verified_at ? "border-emerald-300 bg-emerald-50" : "border-amber-200 bg-amber-50/70"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-950">{label.part_number || "General job label"}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-600">{label.part_description || `Job ${label.job_number}`}</p>
                      <p className="mt-2 text-xs font-semibold text-slate-700">Unit {label.unit_index} of {label.unit_total} · Bin {label.bin_location}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${label.verified_at ? "bg-emerald-600 text-white" : "bg-amber-200 text-amber-950"}`}>
                      {label.verified_at ? "✓ Verified" : "○ Not scanned"}
                    </span>
                  </div>
                  {label.issued_at ? <p className="mt-2 text-xs font-semibold text-emerald-700">✓ Issued after collection check</p> : null}
                  {label.status !== "PRINTED" ? <p className="mt-2 text-xs font-semibold text-amber-800">Print status: {label.status.toLowerCase()}</p> : null}
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
            No validation batch exists for this ticket yet. This is advisory during the pilot and does not block moving the ticket to {ticketStatus === "COMPLETED" ? "COMPLETED" : "COMPLETED later"}.
          </div>
        )}
      </div>
    </section>
  );
}
