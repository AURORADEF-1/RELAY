import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("RICO Fleet server client", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.RICO_FLEET_API_KEY = "fictional-fleet-test-key";
    process.env.RICO_FLEET_API_BASE_URL = "https://app.ricoeurope.com/api/customer";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.RICO_FLEET_API_KEY;
    delete process.env.RICO_FLEET_API_BASE_URL;
  });

  it("keeps Fleet authentication in the bearer header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      customer: "Fictional Fleet",
      total: 1,
      count: 1,
      offset: 0,
      machines: [{
        id: "machine-demo",
        machineRef: "24051",
        label: "TAKEUCHI TB260",
        manufacturer: "TAKEUCHI",
        model: "TB260",
        year: "2016->",
        quantity: 1,
        filterCount: 3,
        units: [{ position: 1, serialNumber: "DEMO-SERIAL", fleetNumber: "24051" }],
      }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { getRicoFleetMachines } = await import("@/lib/integrations/rico/fleet-client");
    const result = await getRicoFleetMachines({ fleetNumber: "24051" });

    expect(result.machines[0]?.machineRef).toBe("24051");
    expect(result.machines[0]?.year).toBe("2016->");
    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(requestUrl)).not.toContain("fictional-fleet-test-key");
    expect(new Headers(requestInit.headers).get("authorization")).toBe(
      "Bearer fictional-fleet-test-key",
    );
    expect(JSON.stringify(result)).not.toContain("fictional-fleet-test-key");
  });

  it("parses verified filters, oils and structured kit components", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      customer: "Fictional Fleet",
      machine: {
        id: "machine-demo",
        machineRef: "24051",
        label: "TAKEUCHI TB260",
        manufacturer: "TAKEUCHI",
        model: "TB260",
      },
      units: [{ position: 1, serialNumber: "DEMO-SERIAL", fleetNumber: "24051" }],
      filters: [{
        partNumber: "RL-DEMO",
        description: "Oil filter",
        filterType: "oil",
        quantity: 1,
        verified: true,
        price: 3.14,
        freeStock: 12,
        inCatalogue: true,
      }],
      oils: [{
        partNumber: "OIL-DEMO",
        applicationArea: "Engine Oil",
        grade: "15W-40",
        quantity: "2.8",
        unit: "L",
        price: 24.25,
        freeStock: 6,
        inCatalogue: true,
      }],
      kits: [{
        kitPartNumber: "FK-DEMO",
        serviceInterval: "1000h",
        source: "rico",
        price: 80.47,
        freeStock: 7,
        inCatalogue: true,
        filters: [
          { partNumber: "RL-DEMO", description: "Oil filter" },
          { partNumber: "RF-DEMO", description: "Fuel filter" },
        ],
      }],
    }), { status: 200 })));

    const { getRicoFleetMachine } = await import("@/lib/integrations/rico/fleet-client");
    const result = await getRicoFleetMachine("24051");

    expect(result.filters[0]).toMatchObject({
      partNumber: "RL-DEMO",
      verified: true,
      price: 3.14,
    });
    expect(result.kits[0]).toMatchObject({
      kitPartNumber: "FK-DEMO",
      serviceInterval: "1000h",
      filters: [
        { partNumber: "RL-DEMO" },
        { partNumber: "RF-DEMO" },
      ],
    });
  });

  it("maps an invalid Fleet key without leaking the response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      "sensitive upstream response",
      { status: 401 },
    )));
    const { getRicoFleetMachines } = await import("@/lib/integrations/rico/fleet-client");
    await expect(getRicoFleetMachines()).rejects.toMatchObject({
      code: "AUTHENTICATION",
      status: 401,
    });
  });
});
