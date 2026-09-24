import type { NextRequest } from "next/server";
import { authorizeJcb, getLinkedFleet, jcbError, jcbJson } from "@/lib/integrations/jcb/server";
import { getJcbFaults, JcbError } from "@/lib/integrations/jcb/client";
import { assessMachine, type HealthRow } from "@/lib/integrations/jcb/health";
export const maxDuration=120;
export async function GET(request:NextRequest){
  try{const auth=await authorizeJcb(request,true);const fleet=await getLinkedFleet(auth);
    if(!fleet.machines.length)throw new JcbError("JCB returned an empty fleet. No machines have been assessed.",503);
    const machines=[...fleet.machines].sort((a,b)=>a.pin.localeCompare(b.pin));
    const after=request.nextUrl.searchParams.get("after");
    if(after&&!machines.some(m=>m.pin===after))throw new JcbError("Fleet changed during this report. Refresh to start again.",409);
    const start=after?machines.findIndex(m=>m.pin===after)+1:0;
    const batch=machines.slice(start,start+6);const rows:HealthRow[]=[];
    // Only three simultaneous upstream requests; partial failure stays visible.
    for(let i=0;i<batch.length;i+=3)rows.push(...await Promise.all(batch.slice(i,i+3).map(async machine=>{try{return assessMachine(machine,(await getJcbFaults(machine.pin)).faults);}catch{return assessMachine(machine,[],true);}})));
    let monitor:string|undefined;
    if(!after){
      monitor="Admin alerts not activated";
      if(process.env.JCB_HEALTH_ALERTS_ENABLED==="true"){
        const last=await auth.supabase.from("jcb_health_runs").select("checked_at,checked,total,failures").order("checked_at",{ascending:false}).limit(1).maybeSingle();
        monitor=last.error?"Monitoring status unavailable":!last.data?"Awaiting first scheduled check":Date.now()-Date.parse(last.data.checked_at)>2*60*60*1000?"Scheduled check overdue — review monitoring":`Last scheduled check: ${last.data.checked_at} · ${Math.max(0,last.data.checked-last.data.failures)}/${last.data.total} assessed`;
      }
    }
    return jcbJson({monitor,rows,total:machines.length,next:start+batch.length<machines.length?batch.at(-1)?.pin:null,checkedAt:fleet.checkedAt});
  }catch(error){return jcbError(error);}
}
