"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { ConsoleIcon } from "@/components/console/console-icon";
import { ConsoleShell } from "@/components/console/console-shell";
import {
  fetchLatestTicketLabelBatch,
  markTicketLabelsIssued,
  normalizePartLabelToken,
  verifyPartLabel,
} from "@/lib/part-label-validation";
import {
  confirmTicketCollection,
  parseCollectionQrPayload,
} from "@/lib/ticket-collection";
import { getSupabaseClient } from "@/lib/supabase";

type ActiveJob = {
  ticketId: string;
  jobNumber: string;
  binLocation: string;
};

type ScanNotice = {
  tone: "green" | "amber" | "red";
  title: string;
  detail: string;
};

export default function ScanAndIssuePage() {
  const [scanValue, setScanValue] = useState("");
  const [activeJob, setActiveJob] = useState<ActiveJob | null>(null);
  const [notice, setNotice] = useState<ScanNotice | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function confirmCollection(ticketId: string, code: string, method: "qr" | "code") {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase environment variables are not configured.");

    const labelsBeforeCollection = await fetchLatestTicketLabelBatch(supabase, ticketId);
    const verifiedCount = labelsBeforeCollection.filter((label) => label.verified_at).length;
    await confirmTicketCollection(supabase, ticketId, code, method);
    const issuedCount = await markTicketLabelsIssued(supabase, ticketId);

    const allVerified = labelsBeforeCollection.length > 0 && verifiedCount === labelsBeforeCollection.length;
    setNotice({
      tone: allVerified ? "green" : "amber",
      title: "Collection verified — ticket remains READY",
      detail: allVerified
        ? `${issuedCount} of ${labelsBeforeCollection.length} labels are verified and issued. Move the ticket to COMPLETED only when the job is genuinely finished.`
        : `Collection was recorded, but only ${verifiedCount} of ${labelsBeforeCollection.length} labels were scanned. This is a pilot warning and has not blocked the process.`,
    });
    window.dispatchEvent(new CustomEvent("relay-label-validation-updated", { detail: { ticketId } }));
  }

  async function handleScan() {
    const rawValue = scanValue.trim();
    if (!rawValue || isWorking) return;
    const supabase = getSupabaseClient();
    if (!supabase) {
      setNotice({ tone: "red", title: "RELAY is not connected", detail: "Supabase environment variables are not configured." });
      return;
    }

    setIsWorking(true);
    try {
      const qrPayload = parseCollectionQrPayload(rawValue);
      if (qrPayload) {
        await confirmCollection(qrPayload.ticketId, qrPayload.code, "qr");
        setActiveJob((current) => current?.ticketId === qrPayload.ticketId ? current : {
          ticketId: qrPayload.ticketId,
          jobNumber: "Collection verified",
          binLocation: "Open ticket for details",
        });
      } else if (/^RLY-/i.test(normalizePartLabelToken(rawValue))) {
        const result = await verifyPartLabel(supabase, rawValue);
        setActiveJob({
          ticketId: result.ticket_id,
          jobNumber: result.job_number,
          binLocation: result.bin_location,
        });
        setNotice({
          tone: result.is_latest_batch ? "green" : "amber",
          title: result.already_verified ? "Label already verified" : "Part label verified",
          detail: `${result.part_number || "General job label"} · unit ${result.unit_index} of ${result.unit_total} · bin ${result.bin_location}${result.is_latest_batch ? "" : " · older READY batch"}.`,
        });
      } else if (/^[A-Z0-9]{6}$/i.test(rawValue)) {
        if (!activeJob) {
          throw new Error("Scan a RELAY part label first so the collection code can be matched to its job.");
        }
        await confirmCollection(activeJob.ticketId, rawValue.toUpperCase(), "code");
      } else {
        throw new Error("Barcode not recognised. Scan an RLY part label, collection barcode or RELAY QR code.");
      }

      setScanValue("");
    } catch (error) {
      setNotice({
        tone: "red",
        title: "Scan not verified",
        detail: error instanceof Error ? error.message : "Unable to process this scan.",
      });
    } finally {
      setIsWorking(false);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  return (
    <AuthGuard requiredRole="admin">
      <ConsoleShell
        title="Scan & Issue"
        eyebrow="RELAY validation pilot"
        contentClassName="console-content-scan"
      >
        <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
          <header className="rounded-3xl bg-slate-950 px-6 py-7 text-white shadow-xl sm:px-8">
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">One-month pilot · soft validation</p>
                <h1 className="mt-3 text-3xl font-black tracking-tight">Scan every part, then verify collection</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                  A standard Bluetooth scanner works as a keyboard. Scan each RLY label, then scan the fitter&apos;s Code 128 collection barcode. A 2D scanner can read the QR instead.
                </p>
              </div>
              <div className="hidden rounded-2xl bg-white/10 p-4 sm:block">
                <ConsoleIcon name="parts" className="h-8 w-8 text-emerald-300" />
              </div>
            </div>
          </header>

          <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <label htmlFor="relay-scan-input" className="text-sm font-bold text-slate-950">Scanner input</label>
            <p className="mt-1 text-sm text-slate-500">Keep this page open on Samantha&apos;s PC. The field refocuses after every scan.</p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input
                id="relay-scan-input"
                ref={inputRef}
                value={scanValue}
                onChange={(event) => setScanValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void handleScan();
                }}
                autoComplete="off"
                placeholder="Scan barcode or QR payload"
                className="min-w-0 flex-1 rounded-2xl border-2 border-slate-300 px-5 py-4 font-mono text-lg font-bold uppercase outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
              />
              <button
                type="button"
                onClick={() => void handleScan()}
                disabled={isWorking || !scanValue.trim()}
                className="rounded-2xl bg-emerald-700 px-6 py-4 text-sm font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isWorking ? "Checking…" : "Verify scan"}
              </button>
            </div>
          </section>

          {notice ? (
            <section className={`mt-5 rounded-3xl border-2 p-6 ${notice.tone === "green" ? "border-emerald-300 bg-emerald-50 text-emerald-950" : notice.tone === "red" ? "border-red-300 bg-red-50 text-red-950" : "border-amber-300 bg-amber-50 text-amber-950"}`}>
              <p className="text-lg font-black">{notice.tone === "green" ? "✓ " : notice.tone === "amber" ? "! " : "× "}{notice.title}</p>
              <p className="mt-2 text-sm font-medium leading-6">{notice.detail}</p>
            </section>
          ) : null}

          <section className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 p-6">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Active scan context</p>
            {activeJob ? (
              <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-2xl font-black text-slate-950">Job {activeJob.jobNumber}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-600">Bin {activeJob.binLocation}</p>
                </div>
                <Link href={`/tickets/${activeJob.ticketId}`} className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-center text-sm font-bold text-slate-900">
                  Open ticket
                </Link>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-600">Scan a physical RLY label to select its ticket. No workflow stage is changed by scanning.</p>
            )}
          </section>

          <section className="mt-5 grid gap-3 sm:grid-cols-3">
            <PilotStep number="1" title="Scan labels" detail="One per physical part unit; one general label if no parts are linked." />
            <PilotStep number="2" title="Verify fitter" detail="Scan their Code 128 collection barcode or QR code." />
            <PilotStep number="3" title="Complete later" detail="The ticket stays READY until an operator deliberately moves it to COMPLETED." />
          </section>
        </div>
      </ConsoleShell>
    </AuthGuard>
  );
}

function PilotStep({ number, title, detail }: { number: string; title: string; detail: string }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-950 text-sm font-black text-white">{number}</span>
      <h2 className="mt-4 text-base font-black text-slate-950">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{detail}</p>
    </article>
  );
}
