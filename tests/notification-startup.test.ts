import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("notification service startup", () => {
  it("retries notification setup after an overlapping sign-in event", async () => {
    const source = await readFile("components/notification-provider.tsx", "utf8");

    expect(source).toContain("setupNotificationsAfterCurrentAttempt = async (expectedUserId: string)");
    expect(source).toContain("await currentAttempt.catch(() => {})");
    expect(source).toContain("void setupNotificationsAfterCurrentAttempt(session.user.id)");
  });

  it("does not lose DYMO startup when sign-in overlaps initialisation", async () => {
    const source = await readFile("components/dymo-print-station.tsx", "utf8");

    expect(source).toContain("startStationAfterCurrentAttempt");
    expect(source).toContain("while (starting && !disposed)");
    expect(source).toContain("station.user_id !== session.user.id");
    expect(source).toContain("void startStationAfterCurrentAttempt()");
  });
});
