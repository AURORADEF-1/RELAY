"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { useNotifications } from "@/components/notification-provider";

const PROMPT_DISMISSED_KEY = "relay:desktop-alert-prompt-dismissed:v1";
const PROMPT_CHANGED_EVENT = "relay:desktop-alert-prompt-changed";
let dismissedForSession = false;

function subscribeToPromptPreference(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(PROMPT_CHANGED_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(PROMPT_CHANGED_EVENT, onChange);
  };
}

function isPromptDismissed() {
  if (dismissedForSession) return true;
  try {
    return window.localStorage.getItem(PROMPT_DISMISSED_KEY) === "true";
  } catch {
    return false;
  }
}

function dismissDesktopAlertPrompt() {
  dismissedForSession = true;
  try {
    window.localStorage.setItem(PROMPT_DISMISSED_KEY, "true");
  } catch {
    // Still dismiss for this session if the browser blocks storage.
  }
  window.dispatchEvent(new Event(PROMPT_CHANGED_EVENT));
}

export function NotificationToasts() {
  const promptDismissed = useSyncExternalStore(
    subscribeToPromptPreference,
    isPromptDismissed,
    () => true,
  );
  const pathname = usePathname();
  const {
    desktopNotificationPermission,
    dismissToast,
    isAuthenticated,
    requestDesktopNotifications,
    toasts,
  } = useNotifications();
  const showDesktopAlertControl =
    isAuthenticated &&
    !promptDismissed &&
    desktopNotificationPermission !== "unsupported" &&
    desktopNotificationPermission !== "granted";

  if (pathname === "/wallboard" || (toasts.length === 0 && !showDesktopAlertControl)) {
    return null;
  }

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-4 z-[90] flex flex-col items-end gap-3 px-4"
      aria-live="polite"
    >
      {showDesktopAlertControl ? (
        <div className="pointer-events-auto w-[min(34rem,calc(100vw-2rem))] rounded-[1.5rem] border border-amber-400/30 bg-[color:var(--background-elevated)] px-5 py-4 shadow-[var(--shadow-panel)] backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-semibold text-[color:var(--foreground-strong)]">
              Enable RELAY desktop alerts
            </p>
            <button
              type="button"
              onClick={dismissDesktopAlertPrompt}
              aria-label="Dismiss desktop alert reminder"
              className="min-h-11 shrink-0 rounded-full px-3 text-sm font-semibold text-[color:var(--foreground-subtle)] transition hover:bg-[color:var(--accent-soft)]"
            >
              Close
            </button>
          </div>
          <p className="mt-1 text-sm leading-6 text-[color:var(--foreground-muted)]">
            {desktopNotificationPermission === "denied"
              ? "Desktop alerts are blocked. Allow notifications for this site in your browser settings, then reload RELAY."
              : "Get Chrome alerts for ticket updates, collection readiness, assigned tasks and RELAY announcements—even while the tab is in the background."}
          </p>
          {desktopNotificationPermission === "default" ? (
            <button
              type="button"
              onClick={() => void requestDesktopNotifications()}
              className="mt-3 rounded-full bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-[color:var(--accent-foreground)] transition hover:opacity-90"
            >
              Enable desktop alerts
            </button>
          ) : null}
        </div>
      ) : null}

      {toasts.map((toast) => {
        const isPanel = toast.variant === "panel";
        const content = (
          <div
            className={`pointer-events-auto rounded-[1.75rem] border shadow-[var(--shadow-panel)] backdrop-blur ${
              isPanel ? "px-6 py-5" : "px-4 py-4"
            } ${
              toast.tone === "success"
                ? "border-[color:rgba(4,120,87,0.24)] bg-[color:var(--background-elevated)]"
                : "border-[color:var(--border)] bg-[color:var(--background-elevated)]"
            } ${isPanel ? "w-[min(52rem,calc(100vw-2rem))]" : "w-[min(34rem,calc(100vw-2rem))]"}`}
          >
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                {isPanel ? (
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--success)]">
                    {toast.eyebrow ?? "Pending Job Alert"}
                  </p>
                ) : null}
                <p className={`${isPanel ? "mt-2 text-lg" : "text-sm"} font-semibold text-[color:var(--foreground-strong)]`}>
                  {toast.title}
                </p>
                <p className={`${isPanel ? "mt-2 text-base leading-7" : "mt-1 text-sm leading-6"} text-[color:var(--foreground-muted)]`}>
                  {toast.description}
                </p>
                {toast.href && isPanel ? (
                  <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--foreground-subtle)]">
                    {toast.href.startsWith("/reports?tab=fleet") ? "Open Fleet Health" : "Open ticket"}
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
                className="rounded-full px-2 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--foreground-subtle)] transition hover:bg-[color:var(--accent-soft)] hover:text-[color:var(--foreground-strong)]"
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
            className={`block transition hover:translate-y-[-1px] ${isPanel ? "self-center" : ""}`}
          >
            {content}
          </Link>
        ) : (
          <div key={toast.id} className={isPanel ? "self-center" : ""}>{content}</div>
        );
      })}
    </div>
  );
}
