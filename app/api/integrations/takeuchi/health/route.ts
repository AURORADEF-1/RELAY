import type { NextRequest } from "next/server";
import { authorizeTakeuchi, getLinkedTakeuchiFleet, takeuchiError } from "@/lib/integrations/takeuchi/server";
import { getTakeuchiDetails } from "@/lib/integrations/takeuchi/client";
import { JcbError } from "@/lib/integrations/jcb/client";
import { jcbJson } from "@/lib/integrations/jcb/server";
import { assessMachine, type HealthRow } from "@/lib/integrations/jcb/health";
export const maxDuration=120;
export async function GET(request:NextRequest){
  try{const auth=await authorizeTakeuchi(request,true);const fleet=await getLinkedTakeuchiFleet(auth);
    if(!fleet.machines.length)throw new JcbError("Takeuchi returned an empty fleet. No machines have been assessed.",503);
    const machines=[...fleet.machines].sort((a,b)=>a.pin.localeCompare(b.pin));
    const after=request.nextUrl.searchParams.get("after");
    if(after&&!machines.some(m=>m.pin===after))throw new JcbError("Fleet changed during this report. Refresh to start again.",409);
    const start=after?machines.findIndex(m=>m.pin===after)+1:0;
    const batch=machines.slice(start,start+6);const rows:HealthRow[]=[];
    // Only three simultaneous upstream requests; partial failure stays visible.
    for(let i=0;i<batch.length;i+=3)rows.push(...await Promise.all(batch.slice(i,i+3).map(async machine=>{try{const data=await getTakeuchiDetails(machine.pin); return assessMachine(machine,data.faults,data.faultError);}catch{return assessMachine(machine,[],true);}})));
    let monitor:string|undefined;
    if(!after){
      monitor="Admin alerts not activated";

    }
    return jcbJson({monitor,rows,total:machines.length,next:start+batch.length<machines.length?batch.at(-1)?.pin:null,checkedAt:fleet.checkedAt});
  }catch(error){return takeuchiError(error);}
}
