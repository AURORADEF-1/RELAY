import type { NextRequest } from "next/server";
import { authorizeTrackunit, getLinkedTrackunitFleet, trackunitError } from "@/lib/integrations/trackunit/server";
import { getTrackunitDetails } from "@/lib/integrations/trackunit/client";
import { applyTelemetry } from "@/lib/integrations/trackunit/normalize";
import { jcbJson } from "@/lib/integrations/jcb/server";
import { JcbError } from "@/lib/integrations/jcb/client";
export const maxDuration=60;
export async function GET(request:NextRequest){
 try {const auth=await authorizeTrackunit(request);const pin=request.nextUrl.searchParams.get('pin');if(!pin||pin.length>100)throw new JcbError('Select a valid machine.',400);
 const fleet=await getLinkedTrackunitFleet(auth);const machine=fleet.machines.find(m=>m.pin===pin);if(!machine)throw new JcbError('Machine not found in Manitou fleet.',404);
 const details=await getTrackunitDetails(pin);
 return jcbJson({machine:auth.admin?applyTelemetry(machine,details.telemetry):machine,faults:details.faults,faultError:details.faultError,checkedAt:details.checkedAt,...(auth.admin?{telemetry:details.telemetry,telemetryError:details.telemetryError}:{})});
 }catch(e){return trackunitError(e);}
}
