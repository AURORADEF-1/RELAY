import {getAssetCareFleet} from '@/lib/integrations/assetcare/server';
import {combineFleet} from '@/lib/integrations/assetcare/normalize';
import {authorizeTakeuchi,getLinkedTakeuchiFleet} from "@/lib/integrations/takeuchi/server";
import type { NextRequest } from "next/server";
import { authorizeJcb,getLinkedFleet,jcbJson,jcbError } from "@/lib/integrations/jcb/server";
import { authorizeTrackunit,getLinkedTrackunitFleet } from "@/lib/integrations/trackunit/server";
export const maxDuration=60;
export async function GET(request:NextRequest){
 // Each provider is independently authorised. A provider outage never appears as an empty, healthy fleet.
 const results=await Promise.allSettled([
  (async()=>getLinkedFleet(await authorizeJcb(request,true)))(),
  (async()=>getLinkedTrackunitFleet(await authorizeTrackunit(request,true)))(),
  (async()=>getLinkedTakeuchiFleet(await authorizeTakeuchi(request,true)))(),
 ]);
 const denied=results.find(r=>r.status==='rejected'&&[401,403].includes(r.reason?.status));
 if(denied?.status==='rejected')return jcbError(denied.reason);
 let machines=results.flatMap((r,i)=>r.status==='fulfilled'?r.value.machines.map(m=>({...m,source:i===0?'jcb' as const:i===1?'trackunit' as const:'takeuchi' as const})):[]);
 const sources=results.map((r,i)=>({provider:i===0?'jcb':i===1?'trackunit':'takeuchi',available:r.status==='fulfilled',count:r.status==='fulfilled'?r.value.machines.length:0,checkedAt:r.status==='fulfilled'?r.value.checkedAt:null,stale:r.status==='fulfilled'?r.value.stale:true}));
 let assetcareStatus=null;
 if(process.env.ASSETCARE_ENABLED==='true'){
  try{const fleet=await getAssetCareFleet();machines=combineFleet([...machines,...fleet.machines]) as typeof machines;assetcareStatus=fleet.status;sources.push({provider:'assetcare',available:true,count:fleet.machines.length,checkedAt:fleet.checkedAt,stale:fleet.stale});}
  catch{sources.push({provider:'assetcare',available:false,count:0,checkedAt:null,stale:true});}
 }
 return jcbJson({machines,admin:true,sources,assetcareStatus},sources.every(s=>!s.available)?503:200);
}
