import { getRegistry, jcbJson } from "@/lib/integrations/jcb/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getTakeuchiFleet } from "@/lib/integrations/takeuchi/client";
import { JcbError } from "@/lib/integrations/jcb/client";
import { authorizeTakeuchi, takeuchiError } from "@/lib/integrations/takeuchi/server";
const changeSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("access"), userId: z.string().uuid(), enabled: z.boolean() }),
  z.object({ action: z.literal("mapping"), pin: z.string().min(1).max(100), machineId: z.string().uuid().nullable() }),
]);
export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeTakeuchi(request, true);
    const [profiles, access, registry] = await Promise.all([
      auth.supabase.from("profiles").select("id,full_name,role").order("full_name").limit(1000),
      auth.supabase.from("jcb_livelink_access").select("user_id,enabled").limit(1000), getRegistry(auth),
    ]);
    if (profiles.error || access.error) throw new JcbError("Unable to read LiveLink access settings.", 503);
    return jcbJson({ profiles: profiles.data, access: access.data, registry });
  } catch (error) { return takeuchiError(error); }
}
export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeTakeuchi(request, true);
    const parsed = changeSchema.safeParse(await request.json());
    if (!parsed.success) throw new JcbError("Invalid LiveLink setting.", 400);
    const change = parsed.data;
    if (change.action === "access") {
      const result = await auth.supabase.from("jcb_livelink_access").upsert({ user_id: change.userId, enabled: change.enabled, updated_by: auth.user.id, updated_at: new Date().toISOString() });
      if (result.error) throw new JcbError("Unable to save fitter access.", 409);
    } else {
      const fleet = await getTakeuchiFleet();
      if (!fleet.machines.some(m => m.pin === change.pin)) throw new JcbError("Machine not found in Takeuchi Track.", 404);
      if (change.machineId === null) {
        const result = await auth.supabase.from("takeuchi_mappings").delete().eq("pin", change.pin);
        if (result.error) throw new JcbError("Unable to remove the link.", 409);
      } else {
        const registry = await getRegistry(auth);
        if (!registry.some(m => m.id === change.machineId && (m.make??"").toUpperCase().startsWith("TAKEUCHI"))) throw new JcbError("RELAY machine not found.", 404);
        const result = await auth.supabase.from("takeuchi_mappings").upsert({ pin: change.pin, machine_id: change.machineId, updated_by: auth.user.id, updated_at: new Date().toISOString() });
        if (result.error) throw new JcbError("Unable to link this machine. It may already be linked to another Takeuchi PIN.", 409);
      }
    }
    return jcbJson({ ok: true });
  } catch (error) { return takeuchiError(error); }
}
