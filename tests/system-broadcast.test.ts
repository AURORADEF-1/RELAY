import { describe, expect, it } from "vitest";
import {
  getRelayBroadcastPreset,
  normalizeRelayBroadcastDraft,
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
});
