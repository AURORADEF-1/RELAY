vi.mock('@/lib/integrations/request-guard',()=>({cachedProvider:async(_provider:string,_key:string,load:()=>Promise<unknown>)=>({data:await load(),checkedAt:new Date().toISOString()}),guardedFetch:async(_provider:string,load:()=>Promise<Response>)=>load()}));
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { equipmentSchema, linkMachines, normalizeEquipment, projectMachine } from "@/lib/integrations/jcb/normalize";
import { partsRequestUrl, positionAge } from "@/lib/integrations/jcb/types";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
const raw = { EquipmentHeader: { Pin: "PIN-ONE", EquipmentId: "24001", Model: "3CX" },
  Location: { Latitude: 52.5, Longitude: 1.2, DateTime: "2026-09-24T08:00:00Z" },
  FuelRemaining: { Percent: "0", DateTime: "2026-09-24T08:00:00Z" }, EngineStatus: { Running: false } };
const machine = normalizeEquipment(equipmentSchema.parse(raw));
const registry = [{ id: "machine-one", machine_number: "24001", serial_number: "PIN-ONE", make: "JCB", model: "3CX" }];
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
describe("LiveLink values, matching and role projection", () => {
  it("preserves genuine zero/false while leaving missing values unavailable", () => {
    expect(machine.fuel?.value).toBe(0); expect(machine.engine?.value).toBe(false); expect(machine.hours).toBeNull();
    const invalid = normalizeEquipment(equipmentSchema.parse({ ...raw, Location: { Latitude: null, Longitude: "" }, FuelRemaining: { Percent: "" } }));
    expect(invalid.position).toBeNull(); expect(invalid.fuel).toBeNull();
  });
  it("rejects invalid coordinates and out-of-range percentages", () => {
    const invalid = normalizeEquipment(equipmentSchema.parse({ ...raw, Location: { Latitude: 100, Longitude: 1 }, FuelRemaining: { Percent: 110 } }));
    expect(invalid.position).toBeNull(); expect(invalid.fuel).toBeNull();
  });
  it("matches a unique exact JCB identity and excludes other manufacturers", () => {
    expect(linkMachines([machine], registry, [])[0].match).toBe("exact");
    expect(linkMachines([machine], [{ ...registry[0], make: "Volvo" }], [])[0].relay).toBeNull();
  });
  it("never infers a link from a serial suffix or ambiguous candidate", () => {
    expect(linkMachines([{ ...machine, equipmentId: "" }], [{ ...registry[0], serial_number: "ONE" }], [])[0].match).toBe("unmatched");
    expect(linkMachines([machine], [...registry, { ...registry[0], id: "other" }], [])[0].match).toBe("ambiguous");
  });
  it("rejects an upstream collision and respects confirmed mappings", () => {
    expect(linkMachines([machine, { ...machine, pin: "PIN-TWO" }], registry, [])[0].relay).toBeNull();
    expect(linkMachines([machine], registry, [{ pin: machine.pin, machine_id: "machine-one" }])[0].match).toBe("confirmed");
  });
  it("does not send health readings to fitter clients", () => {
    const linked = linkMachines([machine], registry, [])[0]; const projected = projectMachine(linked, false);
    expect(projected.position).toEqual(machine.position); expect(projected).not.toHaveProperty("fuel"); expect(projected).not.toHaveProperty("engine");
    expect(projectMachine(linked, true)).toHaveProperty("fuel");
  });
  it("requires a verified link for parts request prefill and encodes parameters", () => {
    const linked = linkMachines([machine], registry, [])[0];
    expect(partsRequestUrl({ ...linked, relay: null })).toBeNull();
    const url = new URL(partsRequestUrl(linked, "A&B")!, "https://relay.example");
    expect(url.searchParams.get("machineReference")).toBe("24001"); expect(url.searchParams.get("livelinkFault")).toBe("A&B");
  });
  it("labels stale, unknown and future readings explicitly", () => {
    expect(positionAge("2026-09-20T08:00:00Z", Date.parse("2026-09-24T08:00:00Z"))).toBe("Position out of date");
    expect(positionAge(null)).toBe("Unknown age"); expect(positionAge("2099-01-01T00:00:00Z")).toBe("Check timestamp");
  });
});
describe("JCB server client", () => {
  beforeEach(() => { vi.resetModules(); process.env.JCB_LIVELINK_USERNAME = "test@example.test"; process.env.JCB_LIVELINK_PASSWORD = "test-password"; process.env.JCB_LIVELINK_CLIENT_SECRET = "test-secret"; });
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.JCB_LIVELINK_USERNAME; delete process.env.JCB_LIVELINK_PASSWORD; delete process.env.JCB_LIVELINK_CLIENT_SECRET; });
  it("authenticates in the request body, follows all pages and caches the token", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json({ access_token: "test-token", expires_in: 3600 }))
      .mockResolvedValueOnce(json({ Equipment: [raw], Links: [{ Rel: "next", Href: "https://jcbll.com/Live/MixedFleetTelematicsService/Fleet/2" }] }))
      .mockResolvedValueOnce(json({ Equipment: [{ EquipmentHeader: { Pin: "PIN-TWO" } }] }));
    vi.stubGlobal("fetch", fetch); const { fetchJcbFleet } = await import("@/lib/integrations/jcb/client");
    const result = await fetchJcbFleet(); expect(result.machines).toHaveLength(2); expect(fetch).toHaveBeenCalledTimes(3);
    expect(String(fetch.mock.calls[0][0])).not.toContain("test-secret"); expect(String(fetch.mock.calls[0][1].body)).toContain("grant_type=password");
    expect(fetch.mock.calls[1][1].headers.Authorization).toBe("Bearer test-token"); expect(fetch.mock.calls[1][1].redirect).toBe("error");
  });
  it("rejects external pagination without leaking the bearer", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json({ access_token: "test-token", expires_in: 3600 }))
      .mockResolvedValueOnce(json({ Equipment: [raw], Links: [{ Rel: "next", Href: "https://attacker.example/steal" }] }));
    vi.stubGlobal("fetch", fetch); const { fetchJcbFleet } = await import("@/lib/integrations/jcb/client");
    await expect(fetchJcbFleet()).rejects.toThrow("unexpected pagination"); expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("renews authentication once after a 401", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json({ access_token: "old", expires_in: 3600 })).mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json({ access_token: "new", expires_in: 3600 })).mockResolvedValueOnce(json({ Equipment: [raw] }));
    vi.stubGlobal("fetch", fetch); const { fetchJcbFleet } = await import("@/lib/integrations/jcb/client");
    await fetchJcbFleet(); expect(fetch).toHaveBeenCalledTimes(4); expect(fetch.mock.calls[3][1].headers.Authorization).toBe("Bearer new");
  });
  it("does not publish a partial fleet if a later page fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json({ access_token: "token", expires_in: 3600 }))
      .mockResolvedValueOnce(json({ Equipment: [raw], Links: [{ Rel: "next", Href: "https://jcbll.com/Live/MixedFleetTelematicsService/Fleet/2" }] }))
      .mockResolvedValueOnce(json({}, 500)));
    const { fetchJcbFleet } = await import("@/lib/integrations/jcb/client"); await expect(fetchJcbFleet()).rejects.toThrow();
  });
  it("stops duplicate pagination", async () => {
    const url = "https://www.jcbll.com/Live/MixedFleetTelematicsService/Fleet";
    const fetch = vi.fn().mockResolvedValueOnce(json({ access_token: "token", expires_in: 3600 })).mockResolvedValueOnce(json({ Equipment: [raw], Links: [{ Rel: "next", Href: url }] }));
    vi.stubGlobal("fetch", fetch); const { fetchJcbFleet } = await import("@/lib/integrations/jcb/client"); await expect(fetchJcbFleet()).rejects.toThrow("pagination did not complete");
  });
  it("collects all fault pages with original severities and dates", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json({ access_token: "token", expires_in: 3600 }))
      .mockResolvedValueOnce(json({ FaultCode: [{ CodeIdentifier: "A", CodeSeverity: "Minor", DateTime: "2026-09-10T10:00:00Z" }], Links: [{ Rel: "next", Href: "https://jcbll.com/Live/MixedFleetTelematicsService/Fleet/Equipment/PIN-ONE/Faults/2" }] }))
      .mockResolvedValueOnce(json({ FaultCode: [{ CodeIdentifier: "B" }] })));
    const { fetchJcbFaults } = await import("@/lib/integrations/jcb/client"); const data = await fetchJcbFaults("PIN-ONE");
    expect(data.faults).toHaveLength(2); expect(data.faults[0].severity).toBe("Minor"); expect(data.faults[0].at).toBe("2026-09-10T10:00:00.000Z");
  });
});
