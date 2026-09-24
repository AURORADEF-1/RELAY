import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
const authorize = vi.hoisted(() => vi.fn());
vi.mock("@/lib/integrations/rico/route-auth", () => ({ authorizeRelayRequesterRoute: authorize }));
import { authorizeTrackunit as authorizeJcb } from "@/lib/integrations/trackunit/server";
const request = {} as NextRequest;
function client(role: string, access: boolean, error: unknown = null) {
  const supabase = { from: vi.fn((table: string) => {
    const chain = { select: () => chain, eq: () => chain, single: async () => ({ data: { role }, error: null }), maybeSingle: async () => ({ data: table === "jcb_livelink_access" && access ? { user_id: "fitter" } : null, error }) };
    return chain;
  }) };
  authorize.mockResolvedValue({ ok: true, user: { id: "fitter" }, supabase }); return supabase;
}
describe("Manitou access boundary", () => {
  beforeEach(() => { process.env.TRACKUNIT_ENABLED = "true"; });
  afterEach(() => { delete process.env.TRACKUNIT_ENABLED; vi.clearAllMocks(); });
  it("rejects signed-out callers", async () => { authorize.mockResolvedValue({ ok: false, status: 401, error: "Authentication is required." }); await expect(authorizeJcb(request)).rejects.toMatchObject({ status: 401 }); });
  it("fails closed until explicitly enabled", async () => { client("admin", false); delete process.env.TRACKUNIT_ENABLED; await expect(authorizeJcb(request)).rejects.toMatchObject({ status: 503 }); });
  it("rejects an ordinary requester without explicit location access", async () => { client("requester", false); await expect(authorizeJcb(request)).rejects.toMatchObject({ status: 403 }); });
  it("allows a granted fitter but rejects admin-only endpoints", async () => { client("requester", true); expect((await authorizeJcb(request)).admin).toBe(false); await expect(authorizeJcb(request, true)).rejects.toMatchObject({ status: 403 }); });
  it("fails closed on a missing table or database error", async () => { client("requester", true, { message: "failed" }); await expect(authorizeJcb(request)).rejects.toMatchObject({ status: 403 }); });
  it("allows existing admins without granting every requester access", async () => { const supabase = client("admin", false); expect((await authorizeJcb(request, true)).admin).toBe(true); expect(supabase.from).not.toHaveBeenCalledWith("jcb_livelink_access"); });
});
