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

  it("maps a timeout without leaking request details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError")));
    const { getRicoProducts } = await import("@/lib/integrations/rico/client");
    await expect(getRicoProducts()).rejects.toMatchObject({ code: "TIMEOUT" });
  });
});
