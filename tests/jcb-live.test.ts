import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
// Explicit opt-in only: normal regression tests never contact JCB.
describe.skipIf(process.env.JCB_LIVE_CHECK !== "true")("JCB live read-only verification", () => {
  it("reads the full real fleet and one machine's fault feed", async () => {
    const { fetchJcbFleet, fetchJcbFaults } = await import("@/lib/integrations/jcb/client");
    const fleet = await fetchJcbFleet();
    expect(fleet.machines.length).toBeGreaterThan(0);
    expect(new Set(fleet.machines.map(m => m.pin)).size).toBe(fleet.machines.length);
    const faults = await fetchJcbFaults(fleet.machines[0].pin);
    expect(Array.isArray(faults.faults)).toBe(true);
    console.info("JCB_LIVE_OK", JSON.stringify({ machines: fleet.machines.length, positions: fleet.machines.filter(m => m.position).length, checkedAt: fleet.checkedAt, sampleFaultCount: faults.faults.length }));
  }, 120_000);
});
