import type { NextRequest } from "next/server";
import { authorizeJcb,getLinkedFleet,jcbJson,jcbError } from "@/lib/integrations/jcb/server";
import { authorizeTrackunit,getLinkedTrackunitFleet } from "@/lib/integrations/trackunit/server";
export const maxDuration=60;
export async function GET(request:NextRequest){
 // Each provider is independently authorised. A provider outage never appears as an empty, healthy fleet.
 const results=await Promise.allSettled([
  (async()=>getLinkedFleet(await authorizeJcb(request,true)))(),
  (async()=>getLinkedTrackunitFleet(await authorizeTrackunit(request,true)))(),
 ]);
 const denied=results.find(r=>r.status==='rejected'&&[401,403].includes(r.reason?.status));
 if(denied?.status==='rejected')return jcbError(denied.reason);
 const machines=results.flatMap((r,i)=>r.status==='fulfilled'?r.value.machines.map(m=>({...m,source:i===0?'jcb' as const:'trackunit' as const})):[]);
 const sources=results.map((r,i)=>({provider:i===0?'jcb':'trackunit',available:r.status==='fulfilled',count:r.status==='fulfilled'?r.value.machines.length:0,checkedAt:r.status==='fulfilled'?r.value.checkedAt:null,stale:r.status==='fulfilled'?r.value.stale:true}));
 return jcbJson({machines,admin:true,sources},results.every(r=>r.status==='rejected')?503:200);
}
