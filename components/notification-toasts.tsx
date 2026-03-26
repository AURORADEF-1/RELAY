"use client";

import Link from "next/link";
import { useNotifications } from "@/components/notification-provider";

export function NotificationToasts() {
  const { toasts, dismissToast } = useNotifications();

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[90] flex w-[min(34rem,calc(100vw-2rem))] flex-col gap-3">
      {toasts.map((toast) => {
        const content = (
          <div
            className={`pointer-events-auto rounded-3xl border shadow-[0_24px_70px_-32px_rgba(15,23,42,0.45)] backdrop-blur ${
              toast.variant === "panel" ? "px-5 py-5" : "px-4 py-4"
            } ${
              toast.tone === "success"
                ? "border-emerald-200 bg-white/95"
                : "border-slate-200 bg-white/95"
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                {toast.variant === "panel" ? (
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-600">
                    Pending Job Alert
                  </p>
                ) : null}
                <p className={`${toast.variant === "panel" ? "mt-2 text-base" : "text-sm"} font-semibold text-slate-950`}>
                  {toast.title}
                </p>
                <p className={`${toast.variant === "panel" ? "mt-2 text-sm leading-7" : "mt-1 text-sm leading-6"} text-slate-600`}>
                  {toast.description}
                </p>
                {toast.href && toast.variant === "panel" ? (
                  <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Open ticket
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void dismissToast(toast.id);
                }}
                className="rounded-full px-2 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Dismiss notification"
              >
                Close
              </button>
            </div>
          </div>
        );

        return toast.href ? (
          <Link
            key={toast.id}
            href={toast.href}
            onClick={() => void dismissToast(toast.id)}
            className="block transition hover:translate-y-[-1px]"
          >
            {content}
          </Link>
        ) : (
          <div key={toast.id}>{content}</div>
        );
      })}
    </div>
  );
}
