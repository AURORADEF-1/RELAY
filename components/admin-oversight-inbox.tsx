"use client";

import Link from "next/link";

export type AdminOversightItem = {
  id: string;
  title: string;
  body: string;
  href?: string;
};

export function AdminOversightInbox({
  items,
  onDismiss,
}: {
  items: AdminOversightItem[];
  onDismiss: (id: string) => void;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <>
      <section className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-800">
              Admin Oversight Inbox
            </p>
            <p className="mt-1 text-sm text-amber-900/80">
              Session-specific prompts for this admin user only.
            </p>
          </div>
          <span className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-amber-800">
            {items.length}
          </span>
        </div>

        <div className="mt-4 space-y-3">
          {items.map((item) => (
            <article
              key={item.id}
              className="rounded-2xl border border-amber-200 bg-white p-4"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{item.body}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {item.href ? (
                    <Link href={item.href} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50">
                      Review
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
      </section>

      <div className="fixed bottom-5 right-5 z-[72] w-full max-w-sm rounded-3xl border border-amber-200 bg-amber-50/95 p-4 shadow-[0_28px_70px_-42px_rgba(15,23,42,0.45)] backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-800">
          Oversight Prompt
        </p>
        <p className="mt-2 text-sm font-semibold text-slate-900">{items[0]?.title}</p>
        <p className="mt-2 text-sm leading-6 text-slate-600">{items[0]?.body}</p>
        <div className="mt-4 flex gap-2">
          {items[0]?.href ? (
            <Link href={items[0].href} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50">
              Open
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => onDismiss(items[0].id)}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Dismiss
          </button>
        </div>
      </div>
    </>
  );
}
