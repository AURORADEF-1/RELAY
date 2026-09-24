import type { NextRequest } from "next/server";
import { getJcbFaults, JcbError } from "@/lib/integrations/jcb/client";
import { authorizeJcb, getLinkedFleet, jcbError, jcbJson } from "@/lib/integrations/jcb/server";
export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeJcb(request);
    const pin = request.nextUrl.searchParams.get("pin");
    const faultCode = request.nextUrl.searchParams.get("fault");
    if (!pin || pin.length > 100 || (faultCode && faultCode.length > 100)) throw new JcbError("Select a valid machine.", 400);
    if (faultCode && !auth.admin) throw new JcbError("Admin access is required for fault details.", 403);
    const fleet = await getLinkedFleet(auth);
    const machine = fleet.machines.find(m => m.pin === pin);
    if (!machine?.relay) throw new JcbError("This JCB machine needs linking to RELAY before a request can be prefilled.", 409);
    const lines = [`JCB LiveLink snapshot — ${new Date().toISOString()}`, `Machine: ${machine.relay.machine_number} · ${machine.model}`, `JCB PIN: ${machine.pin}`, `Fleet data fetched: ${fleet.checkedAt}`];
    if (machine.position) lines.push(`Last-known position: ${machine.position.latitude}, ${machine.position.longitude}`, `Position reported: ${machine.position.at ?? "Time unavailable"}`);
    else lines.push("Position unavailable.");
    if (auth.admin && machine.hours) lines.push(`Operating hours: ${machine.hours.value} (reported ${machine.hours.at ?? "time unavailable"})`);
    if (faultCode) {
      const data = await getJcbFaults(pin);
      const faults = data.faults.filter(f => f.code === faultCode);
      if (!faults.length) throw new JcbError("The selected fault is no longer in the returned records. Review the machine again.", 409);
      lines.push("Reported faults (active/cleared state not supplied):", ...faults.slice(0, 10).map(f => `${f.code}: ${f.description} · ${f.severity} · ${f.at ?? "Time unavailable"}`));
    }
    return jcbJson({ machineReference: machine.relay.machine_number, text: lines.join("\n") });
  } catch (error) { return jcbError(error); }
}
