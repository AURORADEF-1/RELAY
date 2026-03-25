"use client";

export type AdminHealthEventCategory =
  | "auth"
  | "notifications"
  | "presence"
  | "session_control"
  | "workshop"
  | "admin";

export type AdminHealthEvent = {
  id: string;
  category: AdminHealthEventCategory;
  message: string;
  createdAt: string;
};

const HEALTH_STORAGE_KEY = "relay-admin-health-events";
const HEALTH_EVENT_TTL_MS = 15 * 60_000;
const HEALTH_EVENT_DEDUPE_MS = 60_000;
const HEALTH_EVENT_LIMIT = 50;

export function recordAdminHealthEvent(
  category: AdminHealthEventCategory,
  message: string,
) {
  if (typeof window === "undefined") {
    return;
  }

  const now = Date.now();
  const nextEvent: AdminHealthEvent = {
    id: `${category}-${now}-${Math.random().toString(36).slice(2, 8)}`,
    category,
    message: message.trim(),
    createdAt: new Date(now).toISOString(),
  };

  const currentEvents = readAdminHealthEvents().filter((event) => {
    const createdAt = Date.parse(event.createdAt);
    return !Number.isNaN(createdAt) && now - createdAt <= HEALTH_EVENT_TTL_MS;
  });

  const duplicateEvent = currentEvents.find((event) => {
    if (event.category !== category || event.message !== nextEvent.message) {
      return false;
    }

    const createdAt = Date.parse(event.createdAt);
    return !Number.isNaN(createdAt) && now - createdAt <= HEALTH_EVENT_DEDUPE_MS;
  });

  if (duplicateEvent) {
    return;
  }

  const nextEvents = [nextEvent, ...currentEvents].slice(0, HEALTH_EVENT_LIMIT);
  window.localStorage.setItem(HEALTH_STORAGE_KEY, JSON.stringify(nextEvents));
}

export function readAdminHealthEvents() {
  if (typeof window === "undefined") {
    return [] as AdminHealthEvent[];
  }

  const rawValue = window.localStorage.getItem(HEALTH_STORAGE_KEY);

  if (!rawValue) {
    return [] as AdminHealthEvent[];
  }

  try {
    return JSON.parse(rawValue) as AdminHealthEvent[];
  } catch {
    window.localStorage.removeItem(HEALTH_STORAGE_KEY);
    return [] as AdminHealthEvent[];
  }
}

export function getAdminHealthSummary(activeUsersCount: number) {
  const now = Date.now();
  const recentEvents = readAdminHealthEvents().filter((event) => {
    const createdAt = Date.parse(event.createdAt);
    return !Number.isNaN(createdAt) && now - createdAt <= HEALTH_EVENT_TTL_MS;
  });
  const criticalWindowEvents = recentEvents.filter((event) => {
    const createdAt = Date.parse(event.createdAt);
    return !Number.isNaN(createdAt) && now - createdAt <= 5 * 60_000;
  });

  let level: "normal" | "watch" | "high_risk" = "normal";

  if (criticalWindowEvents.length >= 4 || activeUsersCount >= 12) {
    level = "high_risk";
  } else if (recentEvents.length >= 2 || activeUsersCount >= 8) {
    level = "watch";
  }

  return {
    level,
    recentEvents,
    criticalWindowEvents,
  };
}
