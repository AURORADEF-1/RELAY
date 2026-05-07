"use client";

import { useEffect, useState } from "react";

const PAGE_IDLE_TIMEOUT_MS = 5 * 60_000;

export function usePageActivity() {
  const [isVisible, setIsVisible] = useState(
    typeof document === "undefined" ? true : !document.hidden,
  );
  const [isIdle, setIsIdle] = useState(false);

  useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") {
      return;
    }

    let idleTimeoutId: number | null = null;

    const clearIdleTimeout = () => {
      if (idleTimeoutId !== null) {
        window.clearTimeout(idleTimeoutId);
        idleTimeoutId = null;
      }
    };

    const scheduleIdleTimeout = (baseTime: number) => {
      clearIdleTimeout();
      idleTimeoutId = window.setTimeout(() => {
        setIsIdle(true);
        idleTimeoutId = null;
      }, Math.max(0, PAGE_IDLE_TIMEOUT_MS - (Date.now() - baseTime)));
    };

    const handleVisibilityChange = () => {
      setIsVisible(!document.hidden);

      if (!document.hidden) {
        setIsIdle(false);
        scheduleIdleTimeout(Date.now());
      } else {
        clearIdleTimeout();
      }
    };

    const markActivity = () => {
      if (document.hidden) {
        return;
      }

      setIsIdle(false);
      scheduleIdleTimeout(Date.now());
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", markActivity);
    window.addEventListener("pointerdown", markActivity);
    window.addEventListener("keydown", markActivity);
    window.addEventListener("touchstart", markActivity);

    scheduleIdleTimeout(Date.now());

    return () => {
      clearIdleTimeout();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", markActivity);
      window.removeEventListener("pointerdown", markActivity);
      window.removeEventListener("keydown", markActivity);
      window.removeEventListener("touchstart", markActivity);
    };
  }, []);

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
