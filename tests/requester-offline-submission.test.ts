import { describe, expect, it } from "vitest";
import {
  buildRequesterOfflineNotice,
  isLikelyRequesterOfflineError,
} from "@/lib/requester-offline-submission";
import { readFile } from "node:fs/promises";

describe("requester offline submission helpers", () => {
  it("keeps the requester form wired to the offline queue", async () => {
    const source = await readFile("app/submit/page.tsx", "utf8");

    expect(source).toContain("createRequesterOfflineSubmissionRecord");
    expect(source).toContain("await supabase.auth.getSession()");
    expect(source).toContain("if (!navigator.onLine)");
    expect(source).toContain("Save Request Locally");
    expect(source).toContain("void syncOfflineQueue()");
  });

  it("describes offline queue state clearly", () => {
    expect(buildRequesterOfflineNotice(0, false, false)).toMatchObject({
      type: "info",
      message:
        "You’re offline right now. Any request you submit will be saved on this device and sent automatically when the connection returns.",
    });

    expect(buildRequesterOfflineNotice(2, true, false)).toMatchObject({
      type: "info",
      message: "2 saved requests waiting to sync. RELAY will retry automatically in the background.",
    });

    expect(buildRequesterOfflineNotice(1, true, true)).toMatchObject({
      type: "info",
      message: "Saving 1 queued request and syncing them now...",
    });
  });

  it("recognises common network-style submit failures", () => {
    expect(isLikelyRequesterOfflineError(new Error("Failed to fetch"))).toBe(true);
    expect(isLikelyRequesterOfflineError("Network request failed")).toBe(true);
    expect(isLikelyRequesterOfflineError(new Error("Validation failed"))).toBe(false);
    expect(isLikelyRequesterOfflineError(new Error("Validation failed"), false)).toBe(true);
  });
});
