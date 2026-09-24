import type { NextRequest } from "next/server";
import { getJcbFaults, JcbError } from "@/lib/integrations/jcb/client";
import { authorizeJcb, getLinkedFleet, jcbError, jcbJson } from "@/lib/integrations/jcb/server";
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeJcb(request);
    const pin = request.nextUrl.searchParams.get("pin");
    if (!pin || pin.length > 100) throw new JcbError("Select a valid machine.", 400);
    const fleet = await getLinkedFleet(auth);
    const machine = fleet.machines.find(m => m.pin === pin);
    if (!machine) throw new JcbError("Machine not found in the JCB fleet.", 404);
    return jcbJson({ machine, ...await getJcbFaults(pin) });
  } catch (error) { return jcbError(error); }
}
