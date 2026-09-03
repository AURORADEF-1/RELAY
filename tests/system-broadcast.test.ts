import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getRelayBroadcastPreset,
  normalizeRelayBroadcastDraft,
  RELAY_SYSTEM_BROADCAST_CHANNEL,
} from "@/lib/system-broadcast";

describe("RELAY system broadcasts", () => {
  it("provides a ready-to-send offline update preset", () => {
    const preset = getRelayBroadcastPreset("update");
    expect(preset.title).toBe("RELAY update");
    expect(preset.message).toContain("Offline requests");
  });

  it("uses the announcement type title when an admin leaves the title blank", () => {
    expect(
      normalizeRelayBroadcastDraft({
        kind: "maintenance",
        title: "  ",
        message: "  RELAY will be unavailable from 18:00.  ",
      }),
    ).toEqual({
      kind: "maintenance",
      title: "Planned maintenance",
      message: "RELAY will be unavailable from 18:00.",
    });
  });

  it("rejects an empty message", () => {
    expect(() =>
      normalizeRelayBroadcastDraft({ kind: "notice", title: "Notice", message: " " }),
    ).toThrow("Enter a message");
  });

  it("keeps broadcasts persistent and visible for every RELAY role", () => {
    const provider = readFileSync(
      resolve(process.cwd(), "components/notification-provider.tsx"),
      "utf8",
    );
    const runtime = readFileSync(
      resolve(process.cwd(), "components/app-runtime.tsx"),
      "utf8",
    );
    const controlPage = readFileSync(
      resolve(process.cwd(), "app/control/page.tsx"),
      "utf8",
    );
    const broadcastRoute = readFileSync(
      resolve(process.cwd(), "app/api/notifications/broadcast/route.ts"),
      "utf8",
    );
    const broadcastPanel = readFileSync(
      resolve(process.cwd(), "components/admin-broadcast-panel.tsx"),
      "utf8",
    );
    const globalStyles = readFileSync(
      resolve(process.cwd(), "app/globals.css"),
      "utf8",
    );

    expect(provider).toContain('const SYSTEM_BROADCAST_TYPE = "system_broadcast"');
    expect(provider).toContain('notification.type === SYSTEM_BROADCAST_TYPE');
    expect(RELAY_SYSTEM_BROADCAST_CHANNEL).toBe("relay-system-notifications");
    expect(provider).toContain("supabase.channel(`relay-live-${user.id}`)");
    expect(runtime).toContain("<NotificationToasts />");
    expect(runtime).not.toContain("!isFrontCounter ? <NotificationToasts /> : null");
    expect(controlPage).toContain("<AdminBroadcastPanel />");
    expect(broadcastRoute).toContain("/realtime/v1/api/broadcast/");
    expect(broadcastRoute).toContain("realtimeDispatched");
    expect(broadcastPanel).toContain('className="admin-broadcast-field"');
    expect(broadcastPanel).toContain('role="status" aria-live="polite"');
    expect(globalStyles).toContain(".admin-broadcast-panel {");
    expect(globalStyles).toContain(".admin-broadcast-kinds button[aria-pressed=\"true\"]");
    expect(globalStyles).toContain(".admin-broadcast-field textarea {");
    expect(globalStyles).toContain(".admin-broadcast-actions button {");
  });

  it("enforces a bin location for READY tickets in the database", () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20260903064344_enforce_ready_bin_location.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("create trigger enforce_ready_ticket_bin_location");
    expect(migration).toContain(
      "new.status = 'READY' and nullif(btrim(new.bin_location), '') is null",
    );
  });

  it("requests Chrome notification permission only from a visible user action", () => {
    const provider = readFileSync(
      resolve(process.cwd(), "components/notification-provider.tsx"),
      "utf8",
    );
    const toasts = readFileSync(
      resolve(process.cwd(), "components/notification-toasts.tsx"),
      "utf8",
    );

    expect(provider).toContain("Notification.requestPermission()");
    expect(provider).not.toContain('Notification.permission === "default"');
    expect(provider).not.toContain("relay-browser-notification-prompt");
    expect(toasts).toContain("Enable RELAY desktop alerts");
    expect(toasts).toContain("onClick={() => void requestDesktopNotifications()}");
    expect(toasts).not.toContain("isAdmin &&");
    expect(provider).toContain("readyRegistration.showNotification");
    expect(provider).toContain('"/relay-notifications-sw.js"');
  });

  it("uses one live data channel and background-safe Realtime heartbeats", () => {
    const provider = readFileSync(
      resolve(process.cwd(), "components/notification-provider.tsx"),
      "utf8",
    );
    const notifications = readFileSync(
      resolve(process.cwd(), "lib/notifications.ts"),
      "utf8",
    );
    const supabase = readFileSync(resolve(process.cwd(), "lib/supabase.ts"), "utf8");

    expect(provider).toContain("supabase.channel(`relay-live-${user.id}`)");
    expect(provider).not.toContain("relay-pending-tickets-");
    expect(provider).not.toContain("relay-urgent-tickets-");
    expect(notifications).not.toContain("broadcastNotificationRefresh");
    expect(supabase).toContain("worker: true");
    expect(supabase).toContain('status === "disconnected"');
  });
});
