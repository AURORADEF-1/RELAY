import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("RICO server client", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.RICO_RELAY_API_KEY = "fictional-test-key";
    process.env.RICO_API_BASE_URL = "https://ricoeurope.com/reseller-api";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.RICO_RELAY_API_KEY;
    delete process.env.RICO_API_BASE_URL;
  });

  it("parses products and keeps authentication in the upstream request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      total_records: 1,
      offset: 0,
      count: 1,
      products: [{
        id: 55,
        reference: "DEMO-55",
        name: "Fictional filter",
        price: 9.99,
        quantity: 3,
        active: 1,
        images: [],
        features: [],
      }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { getRicoProducts } = await import("@/lib/integrations/rico/client");
    const result = await getRicoProducts({ count: 1 });
    expect(result.products[0]?.reference).toBe("DEMO-55");
    const requestedUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestedUrl.searchParams.get("apikey")).toBe("fictional-test-key");
    expect(JSON.stringify(result)).not.toContain("fictional-test-key");
  });

  it.each([
    [401, "AUTHENTICATION"],
    [403, "FORBIDDEN"],
    [404, "NOT_FOUND"],
    [429, "RATE_LIMITED"],
    [500, "UPSTREAM"],
  ])("maps upstream %s safely", async (status: number, code: string) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("upstream secret body", { status })));
    const { getRicoProducts } = await import("@/lib/integrations/rico/client");
    await expect(getRicoProducts()).rejects.toMatchObject({ code });
  });

  it("distinguishes a Cloudflare challenge from a RICO catalogue denial", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      "<!doctype html><title>Just a moment...</title>",
      {
        status: 403,
        headers: {
          "content-type": "text/html; charset=UTF-8",
          server: "cloudflare",
        },
      },
    )));
    const { getRicoProducts } = await import("@/lib/integrations/rico/client");
    await expect(getRicoProducts()).rejects.toMatchObject({
      code: "UPSTREAM_BLOCKED",
      status: 502,
    });
  });

  it("rejects malformed upstream data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      products: [{ id: "not-a-number" }],
    }), { status: 200 })));
    const { getRicoProducts } = await import("@/lib/integrations/rico/client");
    await expect(getRicoProducts()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("returns an empty documented result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      total_records: 0,
      products: [],
    }), { status: 200 })));
    const { getRicoProducts } = await import("@/lib/integrations/rico/client");
    await expect(getRicoProducts()).resolves.toMatchObject({ products: [], totalRecords: 0 });
  });

  it("retries compact machine models and parses reduced kit records", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        total_records: 0,
        machines: [],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        total_records: 1,
        machines: [{
          machine_id: 290,
          manufacturer: "TAKEUCHI",
          model: "TB 290-2",
          kits: [{
            id_product: 22400,
            reference: "FK-TB290-2",
            name: "Takeuchi TB 290-2 service kit",
            price: 95.5,
            quantity: 4,
          }],
        }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        product: {
          id: 22400,
          reference: "FK-TB290-2",
          name: "Takeuchi TB 290-2 service kit",
          description_short: "<p>Oil Filter</p><p>Fuel Filter</p>",
          price: 95.5,
          quantity: 4,
          active: 1,
          features: [{ name: "Kit Type", value: "Air/Oil/Fuel" }],
          images: [],
        },
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { getRicoMachines } = await import("@/lib/integrations/rico/client");
    const result = await getRicoMachines({
      manufacturer: "TAKEUCHI",
      query: "TB290-2 MIDI EXCAVATOR",
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(new URL(String(fetchMock.mock.calls[1]?.[0])).searchParams.get("q")).toBe("TB 290-2");
    expect(result.machines[0]?.kits[0]).toMatchObject({
      id: 22400,
      reference: "FK-TB290-2",
      active: true,
      descriptionShort: "Oil Filter Fuel Filter",
      features: [{ name: "Kit Type", value: "Air/Oil/Fuel" }],
    });
  });

  it("maps a timeout without leaking request details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError")));
    const { getRicoProducts } = await import("@/lib/integrations/rico/client");
    await expect(getRicoProducts()).rejects.toMatchObject({ code: "TIMEOUT" });
  });
});
