import 'server-only';
import {operationsDatabase,ownership} from '@/lib/fleet-operations/server';
import {linkAssetCare} from '@/lib/integrations/assetcare/normalize';
import type {LinkedJcbMachine} from '@/lib/integrations/jcb/types';
import type {RoamHire} from './hires';
import {calculateHireUsage,type HireUsage,type UsageReading} from './usage';
export async function hireUsage(h:RoamHire):Promise<HireUsage>{
 const direct=calculateHireUsage(h,[],'');
 if(direct.source==='driver'||!direct.deliveryAt)return direct;
 const db=operationsDatabase(),owners=await ownership(db);
 const matches=owners.registry.filter(m=>typeof h.machine.relay_id==='string'?m.id===h.machine.relay_id:m.machine_number.trim().toUpperCase()===String(h.machine.fleet??'').trim().toUpperCase());
 if(matches.length!==1||!owners.allowed.has(matches[0].id))return {hours:null,source:null,reason:'This hire needs a unique active RELAY asset match.'};
 const id=matches[0].id,delivery=Date.parse(direct.deliveryAt);
 const [assets,samples]=await Promise.all([
  db.from('assetcare_assets').select('asset_id,machine').limit(2000),
  db.from('fleet_operation_samples').select('payload').eq('machine_id',id).gte('captured_at',new Date(delivery-30*60000).toISOString()).order('captured_at',{ascending:false}).limit(2000)
 ]);
 if(assets.error||samples.error)throw Error('Unable to read saved telematics hours.');
 // Keep every provider counter separate. A fallback never combines two devices.
 const groups=new Map<string,UsageReading[]>();
 for(const row of samples.data??[]){const m=row.payload as LinkedJcbMachine;if(m.hours?.at){const key=`${m.source??'jcb'}:${m.pin}`;groups.set(key,[...(groups.get(key)??[]),{value:m.hours.value,at:m.hours.at}]);}}
 const candidates=(assets.data??[]).filter(a=>linkAssetCare(a.machine as LinkedJcbMachine,owners.registry).relay?.id===id);
 if(candidates.length===1){
  const asset=candidates[0],m=asset.machine as LinkedJcbMachine;
  // Indexed receipt-time window; bounded query only when an individual hire is opened.
  const batchQuery=()=>db.from('assetcare_batches').select('items').contains('items',[{asset:{id:asset.asset_id}}]);
  const [batches,recent]=await Promise.all([batchQuery().gte('received_at',new Date(delivery-15*60000).toISOString()).lte('received_at',new Date(delivery+45*60000).toISOString()).order('received_at').limit(501),batchQuery().gte('received_at',new Date(Date.now()-24*3600000).toISOString()).order('received_at',{ascending:false}).limit(200)]);
  if(batches.error||recent.error)throw Error('Unable to read delivery-time telematics.');
  if((batches.data?.length??0)<=500){
   const readings:UsageReading[]=m.hours?.at?[{value:m.hours.value,at:m.hours.at}]:[];
   for(const batch of [...(batches.data??[]),...(recent.data??[])])for(const raw of batch.items??[]){const r=raw.type==='event'?raw.details?.telemetry:raw;if(r?.type==='telemetry'&&r.asset?.id===asset.asset_id&&typeof r.counters?.hours==='number'&&typeof r.date==='string')readings.push({value:r.counters.hours,at:r.date});}
   groups.set('Asset Care+',readings);
  }
 }
 const results=[...groups].map(([provider,readings])=>calculateHireUsage(h,readings,provider.split(':')[0]));
 return results.filter(r=>r.hours!==null).sort((a,b)=>Date.parse(b.end!.at)-Date.parse(a.end!.at))[0]??results[0]??direct;
}
