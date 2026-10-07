import 'server-only';
import {groupedFleet} from '@/lib/fleet-map/group-store';
import {getAssetCareFleet} from '@/lib/integrations/assetcare/server';
import {combineFleet} from '@/lib/integrations/assetcare/normalize';
import {authorizeTakeuchi,getLinkedTakeuchiFleet} from "@/lib/integrations/takeuchi/server";
import type { NextRequest } from "next/server";
import { authorizeJcb,getLinkedFleet } from "@/lib/integrations/jcb/server";
import { authorizeTrackunit,getLinkedTrackunitFleet } from "@/lib/integrations/trackunit/server";
import {operationsDatabase} from '@/lib/fleet-operations/server';
import type {LinkedJcbMachine} from '@/lib/integrations/jcb/types';
import {readAllRoamHires} from '@/lib/integrations/roam/hires-server';
import {mergeRoamMap} from '@/lib/integrations/roam/map';
type VoltageSample={provider:string;pin:string;captured_at:string;payload:{batteryVoltage?:{value?:unknown;at?:unknown}|null}};
async function restoreRecentVoltages(machines:LinkedJcbMachine[]){
 try{
  const result=await operationsDatabase().rpc('fleet_operations_latest').select('provider,pin,captured_at,payload');
  if(result.error)return machines;
  const readings=new Map<string,{value:number;at:string|null}>();
  for(const sample of result.data as VoltageSample[]){const reading=sample.payload?.batteryVoltage,value=reading?.value,at=typeof reading?.at==='string'&&Number.isFinite(Date.parse(reading.at))?reading.at:null;if(typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=100&&Date.now()-Date.parse(at??sample.captured_at)<=7*86400000)readings.set(`${sample.provider}:${sample.pin}`,{value,at});}
  return machines.map(machine=>machine.batteryVoltage?machine:{...machine,batteryVoltage:readings.get(`${machine.source}:${machine.pin}`)??null});
 }catch{return machines;}
}
export async function combinedFleet(request:NextRequest){
 // Each provider is independently authorised. A provider outage never appears as an empty, healthy fleet.
 const results=await Promise.allSettled([
  (async()=>getLinkedFleet(await authorizeJcb(request,true)))(),
  (async()=>getLinkedTrackunitFleet(await authorizeTrackunit(request,true)))(),
  (async()=>getLinkedTakeuchiFleet(await authorizeTakeuchi(request,true)))(),
 ]);
 const denied=results.find(r=>r.status==='rejected'&&[401,403].includes(r.reason?.status));
 if(denied?.status==='rejected')throw denied.reason;
 let machines:LinkedJcbMachine[]=results.flatMap((r,i)=>r.status==='fulfilled'?r.value.machines.map(m=>({...m,source:i===0?'jcb' as const:i===1?'trackunit' as const:'takeuchi' as const})):[]);
 const sources=results.map((r,i)=>({provider:i===0?'jcb':i===1?'trackunit':'takeuchi',available:r.status==='fulfilled',count:r.status==='fulfilled'?r.value.machines.length:0,checkedAt:r.status==='fulfilled'?r.value.checkedAt:null,stale:r.status==='fulfilled'?r.value.stale:true}));
 let assetcareStatus=null;
 if(process.env.ASSETCARE_ENABLED==='true'){
  try{const fleet=await getAssetCareFleet();machines=combineFleet([...machines,...fleet.machines]) as typeof machines;assetcareStatus=fleet.status;sources.push({provider:'assetcare',available:true,count:fleet.machines.length,checkedAt:fleet.checkedAt,stale:fleet.stale});}
  catch{sources.push({provider:'assetcare',available:false,count:0,checkedAt:null,stale:true});}
 }
 try{
  const roam=await readAllRoamHires();
  machines=mergeRoamMap(machines,roam.items);
  sources.push({provider:'roam',available:true,count:roam.items.filter(h=>h.status==='on_site').length,checkedAt:roam.generatedAt,stale:false});
 }catch{sources.push({provider:'roam',available:false,count:0,checkedAt:null,stale:true});}
 machines=await restoreRecentVoltages(machines) as typeof machines;
 let groupError=false;
 try{machines=await groupedFleet(machines) as typeof machines;}catch{groupError=true;}
 return {machines,admin:true,sources,assetcareStatus,groupError};
}
