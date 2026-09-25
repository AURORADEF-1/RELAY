import type {NextRequest} from 'next/server';
import {z} from 'zod';
import {authorizeAssets} from '@/lib/assets/access';
import {cardStatus,engineFromTelemetry} from '@/lib/assets/card-status';
import {operationsDatabase,ownership} from '@/lib/fleet-operations/server';
import {jcbJson,jcbError} from '@/lib/integrations/jcb/server';
import {JcbError} from '@/lib/integrations/jcb/client';
import {unitSchema,normalizeUnit,faultSchema,normalizeFault,telemetrySchema} from '@/lib/integrations/trackunit/normalize';
import {machineKey,type JcbFault,type LinkedJcbMachine} from '@/lib/integrations/jcb/types';
const faultsSchema=z.array(z.object({code:z.string(),description:z.string(),severity:z.string(),at:z.string().nullable()}));
export async function GET(request:NextRequest){try{
 await authorizeAssets(request);const db=operationsDatabase(),{allowed}=await ownership(db),now=Date.now();
 const [samples,cache,takeuchi,movements]=await Promise.all([
  db.rpc('fleet_operations_latest').limit(1000),
  db.from('fleet_api_cache').select('provider,cache_key,payload,checked_at,lease_until').or('cache_key.like.faults:%,cache_key.like.report/unitActiveFaults:%,cache_key.eq.unit:fleet,cache_key.like.GetUnitExtendedInfo:%').limit(1000),
  db.from('takeuchi_api_cache').select('cache_key,payload,checked_at,lease_until').like('cache_key','faults:%').limit(1000),
  db.rpc('asset_inbox_current_events').select('machine_id,provider,kind,occurred_at').in('kind',['movement','yard_arrival','yard_departure']).gte('occurred_at',new Date(now-86400000).toISOString()).order('occurred_at',{ascending:false}).limit(1000)
 ]);
 if(samples.error||cache.error||takeuchi.error||movements.error||[samples,cache,takeuchi,movements].some(r=>(r.data?.length??0)>=1000))throw new JcbError('Machine status is unavailable. No health assessment can be made.',503);
 if(!Array.isArray(movements.data))throw new JcbError('Movement status unavailable.',503);
 const movementRows=movements.data as {machine_id:string;provider:string;kind:string;occurred_at:string}[];
 const units=z.object({list:z.array(unitSchema)}).safeParse(cache.data.find(r=>r.provider==='trackunit'&&r.cache_key==='unit:fleet')?.payload);
 const unitIds=new Map(units.success?units.data.list.map(r=>{const m=normalizeUnit(r);return [m.pin,m.unitId];}):[]);
 const rows=(samples.data??[]) as {machine_id:string;payload:LinkedJcbMachine}[];
 const statuses:Record<string,ReturnType<typeof cardStatus>>={};
 for(const row of rows){if(!allowed.has(row.machine_id))continue;const m=row.payload,provider=m.source??'jcb';
  const entry=provider==='takeuchi'?takeuchi.data.find(r=>r.cache_key===`faults:${m.pin}`):cache.data.find(r=>r.provider===provider&&r.cache_key===(provider==='trackunit'?`report/unitActiveFaults:${unitIds.get(m.pin)}`:`faults:${m.pin}`));
  let faults:JcbFault[]|null=null;
  if(provider==='trackunit'){const parsed=z.object({list:z.array(faultSchema)}).safeParse(entry?.payload);if(parsed.success)faults=parsed.data.list.map(normalizeFault);}
  else {const parsed=faultsSchema.safeParse(provider==='jcb'?entry?.payload?.faults:entry?.payload);if(parsed.success)faults=parsed.data;}
  const complete=entry&&Date.parse(entry.lease_until)-Date.parse(entry.checked_at)<=901000;
  const check=faults&&entry?.checked_at?{faults,checkedAt:entry.checked_at,complete:!!complete}:null;
  if(provider==='trackunit'){const telemetry=z.object({result:z.array(telemetrySchema)}).safeParse(cache.data.find(r=>r.provider==='trackunit'&&r.cache_key===`GetUnitExtendedInfo:${unitIds.get(m.pin)}`)?.payload);if(telemetry.success)m.engine=engineFromTelemetry(telemetry.data.result);}
  statuses[machineKey(m)]=cardStatus(m,check,movementRows.find(e=>e.machine_id===row.machine_id&&e.provider===provider)??null,now);
 }
 return jcbJson({statuses,checkedAt:new Date(now).toISOString()});
 }catch(e){return jcbError(e);}}
