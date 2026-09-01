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

    expect(provider).toContain('const SYSTEM_BROADCAST_TYPE = "system_broadcast"');
    expect(provider).toContain('notification.type === SYSTEM_BROADCAST_TYPE');
    expect(RELAY_SYSTEM_BROADCAST_CHANNEL).toBe("relay-system-notifications");
    expect(provider).toContain("supabase.channel(RELAY_SYSTEM_BROADCAST_CHANNEL)");
    expect(runtime).toContain("<NotificationToasts />");
    expect(runtime).not.toContain("!isFrontCounter ? <NotificationToasts /> : null");
  });
});
