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
 for(const row of samples.data??[]){const m=row.payload as LinkedJcbMachine;if(m.hours?.at){const key=`${m.source??'jcb'}:${m.pin}`;groups.set(key,[...(groups.get(key)??[]),{value:m.hours.value,at:m.hours.at,ignition:m.ignition?.at===m.hours.at?m.ignition.value:null}]);}}
 const candidates=(assets.data??[]).filter(a=>linkAssetCare(a.machine as LinkedJcbMachine,owners.registry).relay?.id===id);
 if(candidates.length===1){
  const asset=candidates[0],m=asset.machine as LinkedJcbMachine;
  // Return only this asset's numeric counters; never transfer whole multi-asset batches.
  const history=await db.rpc('roam_hire_usage_readings',{p_asset_id:asset.asset_id,p_delivery:direct.deliveryAt,p_collection:typeof h.collection.collected_at==='string'?h.collection.collected_at:null});
  if(history.error)throw Error('Unable to read delivery-time telematics.');
  const readings:UsageReading[]=m.hours?.at?[{value:m.hours.value,at:m.hours.at,ignition:m.ignition?.at===m.hours.at?m.ignition.value:null}]:[];
  for(const row of history.data??[])if(typeof row.value==='number'&&typeof row.at==='string')readings.push(row);
  groups.set('Asset Care+',readings);
 }
 const results=[...groups].map(([provider,readings])=>calculateHireUsage(h,readings,provider.split(':')[0]));
 return results.filter(r=>r.hours!==null).sort((a,b)=>Date.parse(b.end!.at)-Date.parse(a.end!.at))[0]??results[0]??direct;
}
