"use client";

import Link from "next/link";
import { useState } from "react";
import {
  RELAY_TERMS_VERSION,
  relayDataProtectionClause,
  relayTermsBullets,
} from "@/lib/legal";

const ACCEPTANCE_STORAGE_KEY = "relay-accepted-terms-version";

export function LegalTermsGate() {
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    const acceptedVersion = window.localStorage.getItem(ACCEPTANCE_STORAGE_KEY);
    return acceptedVersion !== RELAY_TERMS_VERSION;
  });

  function handleAccept() {
    window.localStorage.setItem(ACCEPTANCE_STORAGE_KEY, RELAY_TERMS_VERSION);
    setIsOpen(false);
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-[2rem] border border-white/80 bg-white p-6 shadow-[0_30px_80px_-28px_rgba(15,23,42,0.45)] sm:p-8">
        <div className="space-y-5">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Legal Notice
            </p>
            <h2 className="text-3xl font-semibold tracking-[-0.04em] text-slate-950">
              RELAY Terms and Data Protection
            </h2>
            <p className="text-sm leading-7 text-slate-600">
              Please review and accept the current RELAY terms before using the
              system. This prompt appears once per terms version.
            </p>
          </div>

          <div className="grid gap-5 lg:grid-cols-[0.92fr_1.08fr]">
            <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                Terms of Use
              </p>
              <ul className="mt-4 space-y-3 text-sm leading-7 text-slate-600">
                {relayTermsBullets.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                Data Protection
              </p>
              <div className="mt-4 max-h-64 space-y-4 overflow-y-auto pr-1 text-sm leading-7 text-slate-600">
                {relayDataProtectionClause.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Link
              href="/legal"
              className="text-sm font-semibold text-slate-600 transition hover:text-slate-900"
            >
              Open full legal help
            </Link>
            <button
              type="button"
              onClick={handleAccept}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Accept and Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
