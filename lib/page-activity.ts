"use client";

import { useEffect, useState } from "react";

const PAGE_IDLE_TIMEOUT_MS = 5 * 60_000;

export function usePageActivity() {
  const [isVisible, setIsVisible] = useState(
    typeof document === "undefined" ? true : !document.hidden,
  );
  const [lastActivityAt, setLastActivityAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") {
      return;
    }

    const handleVisibilityChange = () => {
      setIsVisible(!document.hidden);

      if (!document.hidden) {
        setLastActivityAt(Date.now());
      }
    };

    const markActivity = () => {
      setLastActivityAt(Date.now());
    };

    const tickId = window.setInterval(() => {
      setNow(Date.now());
    }, 30_000);

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", markActivity);
    window.addEventListener("pointerdown", markActivity);
    window.addEventListener("keydown", markActivity);
    window.addEventListener("touchstart", markActivity);

    return () => {
      window.clearInterval(tickId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", markActivity);
      window.removeEventListener("pointerdown", markActivity);
      window.removeEventListener("keydown", markActivity);
      window.removeEventListener("touchstart", markActivity);
    };
  }, []);

  const isIdle = now - lastActivityAt >= PAGE_IDLE_TIMEOUT_MS;

  return {
    isVisible,
    isIdle,
    isInteractive: isVisible && !isIdle,
  };
}

export function getAdaptivePollDelay(
  baseMs: number,
  options?: {
    isVisible?: boolean;
    isIdle?: boolean;
    failureCount?: number;
    maxMs?: number;
    hiddenMultiplier?: number;
    idleMultiplier?: number;
  },
) {
  const visible = options?.isVisible ?? true;
  const idle = options?.isIdle ?? false;
  const hiddenMultiplier = options?.hiddenMultiplier ?? 3;
  const idleMultiplier = options?.idleMultiplier ?? 2;
  const failureCount = options?.failureCount ?? 0;
  const maxMs = options?.maxMs ?? baseMs * 8;

  let nextDelay = baseMs;

  if (!visible) {
    nextDelay *= hiddenMultiplier;
  } else if (idle) {
    nextDelay *= idleMultiplier;
  }

  if (failureCount > 0) {
    nextDelay *= 2 ** Math.min(failureCount, 3);
  }

  return Math.min(nextDelay, maxMs);
}
