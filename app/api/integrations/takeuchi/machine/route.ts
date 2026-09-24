import type { NextRequest } from "next/server";
import { authorizeTakeuchi, getLinkedTakeuchiFleet, takeuchiError } from "@/lib/integrations/takeuchi/server";
import { getTakeuchiDetails } from "@/lib/integrations/takeuchi/client";
import { jcbJson } from "@/lib/integrations/jcb/server";
import { JcbError } from "@/lib/integrations/jcb/client";
export const maxDuration=60;
export async function GET(request:NextRequest){
 try {const auth=await authorizeTakeuchi(request);const pin=request.nextUrl.searchParams.get('pin');if(!pin||pin.length>100)throw new JcbError('Select a valid machine.',400);
 const fleet=await getLinkedTakeuchiFleet(auth);const machine=fleet.machines.find(m=>m.pin===pin);if(!machine)throw new JcbError('Machine not found in Takeuchi fleet.',404);
 const details=await getTakeuchiDetails(pin);
 return jcbJson({machine:machine,faults:details.faults,faultError:details.faultError,checkedAt:details.checkedAt,...(auth.admin?{telemetryError:false}:{})});
 }catch(e){return takeuchiError(e);}
}
