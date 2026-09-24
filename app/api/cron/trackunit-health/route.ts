import { validCronAuthorization } from "@/lib/integrations/jcb/cron-auth";
import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { getTrackunitFleet, getTrackunitDetails } from "@/lib/integrations/trackunit/client";
import { applyTelemetry } from "@/lib/integrations/trackunit/normalize";
import { assessMachine } from "@/lib/integrations/jcb/health";
import { jcbJson } from "@/lib/integrations/jcb/server";
export const maxDuration=300;
export async function GET(request:NextRequest){
  if(!validCronAuthorization(request.headers.get("authorization"),process.env.CRON_SECRET))return jcbJson({error:"Authentication required."},401);
  if(process.env.TRACKUNIT_HEALTH_ALERTS_ENABLED!=="true")return jcbJson({enabled:false});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.JCB_HEALTH_DATABASE_KEY;
  if(!url||!key||process.env.TRACKUNIT_ENABLED!=="true")return jcbJson({error:"Health monitoring is not configured."},503);
  const supabase=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const issues:{key:string;summary:string}[]=[];let checked=0,total=0,failed=0;let nextStart:string|null=null;
  const started=Date.now();
  try{
    const last=await supabase.from("trackunit_health_runs").select("next_pin").order("checked_at",{ascending:false}).limit(1).maybeSingle();
    if(last.error)return jcbJson({error:"Unable to read monitoring scan position."},503);
    const fleet=await getTrackunitFleet();total=fleet.machines.length;
    const sorted=[...fleet.machines].sort((a,b)=>a.pin.localeCompare(b.pin));
    const start=Math.max(0,sorted.findIndex(m=>m.pin===last.data?.next_pin));
    const machines=[...sorted.slice(start),...sorted.slice(0,start)];
    let cursor=0;
    await Promise.all(Array.from({length:4},async()=>{while(cursor<total&&Date.now()-started<230000){const machine=machines[cursor++];
      try{const data=await getTrackunitDetails(machine.pin);if(data.faultError||data.telemetryError)failed++;const row=assessMachine({...applyTelemetry(machine,data.telemetry),relay:null,match:"unmatched"},data.faults,data.faultError||data.telemetryError);for(const issue of row.issues.filter(i=>i.notify))issues.push({key:`${machine.pin}:${issue.key}`,summary:`${machine.equipmentId||machine.pin}: ${issue.title}${issue.code?` (${issue.code})`:""}. ${issue.action}`});}
      catch{failed++;}finally{checked++;}
    }}));
    nextStart=checked<total?machines[cursor]?.pin??null:null;
    if(!total||failed||checked<total)issues.push({key:"scan-incomplete",summary:`Manitou health scan incomplete: ${checked-failed}/${total} machines assessed. Retry Fleet Health; do not treat missing results as clear.`});
  }catch{failed++;issues.push({key:"feed-unavailable",summary:"Manitou fleet health feed unavailable. Open Fleet Health, retry, and check urgent machine concerns with operators directly."});}
  const result=await supabase.rpc("deliver_trackunit_health_digest",{issues,scanned:checked,fleet_total:total,failed,next_start:nextStart});
  if(result.error)return jcbJson({error:"Unable to save health notifications."},503);
  return jcbJson({checked,total,failed,notifications:result.data});
}
