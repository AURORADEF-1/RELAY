import { describe, expect, it } from "vitest";
import { isDailySessionExpired } from "@/lib/account-session-policy";

describe("daily account sessions", () => {
  it("keeps a login from after the current 04:00 UK boundary", () => {
    expect(isDailySessionExpired("2026-10-19T05:00:00Z", new Date("2026-10-19T10:00:00Z"))).toBe(false);
  });

  it("expires a login from before the current 04:00 UK boundary", () => {
    expect(isDailySessionExpired("2026-10-19T01:00:00Z", new Date("2026-10-19T10:00:00Z"))).toBe(true);
  });

  it("treats a missing login timestamp as expired", () => {
    expect(isDailySessionExpired(null, new Date("2026-10-19T10:00:00Z"))).toBe(true);
  });
});
