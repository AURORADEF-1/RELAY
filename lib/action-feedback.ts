"use client";

export function triggerActionFeedback() {
  try {
    const audio = new Audio("/notification.aiff");
    audio.volume = 0.18;
    void audio.play().catch(() => undefined);
  } catch {
    // Ignore audio playback failures.
  }

  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate?.(18);
  }
}
