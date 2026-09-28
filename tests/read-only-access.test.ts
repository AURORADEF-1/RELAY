import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getRelaySessionUserFromRequest } from "@/lib/security";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

function mockAccount(metadata: Record<string, unknown>, userMetadata = {}) {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-publishable-key");
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    id: "read-only-test-user", app_metadata: metadata, user_metadata: userMetadata,
  }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function request(method: string) {
  return new NextRequest("https://relay.example/api/notifications/dispatch", {
    method, headers: { authorization: "Bearer existing-session-token" },
  });
}

describe("read-only account server authorization", () => {
  it.each(["POST", "PUT", "PATCH", "DELETE"])("blocks %s using current account metadata", async method => {
    const fetchMock = mockAccount({ relay_read_only: true }, { relay_read_only: false });
    expect(await getRelaySessionUserFromRequest(request(method))).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith("https://example.supabase.co/auth/v1/user", expect.objectContaining({ cache: "no-store" }));
  });
  it.each(["GET", "HEAD"])("retains %s viewing access", async method => {
    mockAccount({ relay_read_only: true });
    expect(await getRelaySessionUserFromRequest(request(method))).toMatchObject({ id: "read-only-test-user" });
  });
  it("does not change ordinary accounts or trust editable user metadata", async () => {
    mockAccount({}, { relay_read_only: true });
    expect(await getRelaySessionUserFromRequest(request("POST"))).toMatchObject({ id: "read-only-test-user" });
  });
});
