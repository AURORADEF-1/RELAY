import "server-only";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authorizeRelayRequesterRoute } from "@/lib/integrations/rico/route-auth";
import { getJcbFleet, JcbError } from "./client";
import { linkMachines, projectMachine } from "./normalize";
import type { RegistryMachine } from "./types";

export async function authorizeJcb(request: NextRequest, adminOnly = false) {
  const auth = await authorizeRelayRequesterRoute(request);
  if (!auth.ok) throw new JcbError(auth.error, auth.status);
  if (process.env.JCB_LIVELINK_ENABLED !== "true") throw new JcbError("JCB LiveLink is not enabled yet.", 503);
  const { data: profile, error } = await auth.supabase.from("profiles").select("role").eq("id", auth.user.id).single();
  if (error) throw new JcbError("Unable to check LiveLink access.", 503);
  const admin = profile.role === "admin";
  if (adminOnly && !admin) throw new JcbError("Admin access is required.", 403);
  if (!admin) {
    const access = await auth.supabase.from("jcb_livelink_access").select("user_id").eq("user_id", auth.user.id).eq("enabled", true).maybeSingle();
    if (access.error || !access.data) throw new JcbError("Ask an administrator to enable your JCB LiveLink access.", 403);
  }
  return { ...auth, admin };
}
export type JcbAccess = Awaited<ReturnType<typeof authorizeJcb>>;
export async function getRegistry(auth: JcbAccess) {
  const registry: RegistryMachine[] = [];
  for (let offset = 0; offset < 50_000; offset += 500) {
    const result = await auth.supabase.from("machines").select("id,machine_number,serial_number,make,model").order("id").range(offset, offset + 499);
    if (result.error) throw new JcbError("Unable to read the RELAY machine register.", 503);
    registry.push(...(result.data ?? []));
    if (!result.data || result.data.length < 500) return registry;
  }
  throw new JcbError("The RELAY machine register exceeded the supported page limit.");
}
export async function getLinkedFleet(auth: JcbAccess) {
  const [fleet, registry, mappings] = await Promise.all([
    getJcbFleet(), getRegistry(auth), auth.supabase.from("jcb_livelink_mappings").select("pin,machine_id").order("pin").limit(10_000),
  ]);
  if (mappings.error || (mappings.data?.length ?? 0) >= 10_000) throw new JcbError("LiveLink machine linking is not ready. Ask an administrator to check the setup.", 503);
  return { machines: linkMachines(fleet.machines, registry, mappings.data ?? []).map(m => projectMachine(m, auth.admin)),
    checkedAt: fleet.checkedAt, admin: auth.admin, stale: Date.now() - Date.parse(fleet.checkedAt) > 20 * 60_000 };
}
export function jcbJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store", Vary: "Authorization" } });
}
export function jcbError(error: unknown) {
  return jcbJson({ error: error instanceof JcbError ? error.message : "JCB LiveLink is temporarily unavailable. Existing RELAY requests are unaffected." }, error instanceof JcbError ? error.status : 503);
}
