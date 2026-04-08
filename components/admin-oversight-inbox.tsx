"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type AdminOversightItem = {
  id: string;
  title: string;
  body: string;
  href?: string;
  actionLabel?: string;
};

export function AdminOversightInbox({
  items,
  onDismiss,
}: {
  items: AdminOversightItem[];
  onDismiss: (id: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const primaryItem = items[0] ?? null;
  const inboxLabel = useMemo(
    () => `${items.length} message${items.length === 1 ? "" : "s"}`,
    [items.length],
  );
  if (items.length === 0) {
    return null;
  }

  return (
    <>
      <div className="fixed right-5 top-24 z-[72] flex items-start gap-3">
        {primaryItem ? (
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="hidden rounded-2xl border border-amber-200 bg-amber-50/95 px-4 py-3 text-left shadow-[0_24px_60px_-36px_rgba(15,23,42,0.45)] backdrop-blur transition hover:border-amber-300 hover:bg-amber-50 lg:block"
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-10 min-w-10 items-center justify-center rounded-2xl bg-slate-950 px-3 text-sm font-semibold text-white">
                {items.length}
              </span>
              <div className="max-w-[16rem]">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-800">
                  Inbox
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{primaryItem.title}</p>
                <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-600">
                  {primaryItem.body}
                </p>
              </div>
            </div>
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="relative inline-flex h-12 items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.45)] transition hover:border-slate-400 hover:bg-slate-50"
        >
          Inbox
          <span className="ml-3 inline-flex min-w-8 items-center justify-center rounded-full bg-rose-600 px-2 py-1 text-xs font-semibold text-white">
            {items.length}
          </span>
        </button>
      </div>

      {isOpen ? (
        <div className="fixed inset-0 z-[80] flex items-start justify-end bg-slate-950/45 p-4 sm:p-6">
          <div className="w-full max-w-3xl overflow-hidden rounded-[2rem] border border-amber-200 bg-white shadow-[0_40px_120px_-52px_rgba(15,23,42,0.45)]">
            <div className="flex items-start justify-between gap-4 border-b border-amber-100 bg-amber-50 px-6 py-5">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-800">
                  Inbox
                </p>
                <p className="mt-1 text-sm text-amber-900/80">
                  Session-specific prompts for this admin user only.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-amber-800">
                  {inboxLabel}
                </span>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="max-h-[75vh] overflow-y-auto px-6 py-6">
              <div className="space-y-4">
                {items.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-[1.75rem] border border-amber-200 bg-amber-50/50 p-5"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="max-w-2xl">
                        <p className="text-base font-semibold text-slate-900">{item.title}</p>
                        <p className="mt-2 text-sm leading-7 text-slate-600">{item.body}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {item.href ? (
                          <Link
                            href={item.href}
                            onClick={() => setIsOpen(false)}
                            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                          >
                            {item.actionLabel ?? "Review"}
                          </Link>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => onDismiss(item.id)}
                          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
