import 'server-only';
import {operationsDatabase} from '@/lib/fleet-operations/server';
import {assetCareReadings} from './readings';
// Legacy snapshots: bounded, indexed lookup around the batch that wrote this asset.
export async function savedAssetCareReadings(pin:string){
 const db=operationsDatabase();const asset=await db.from('assetcare_assets').select('received_at,machine').eq('asset_id',pin).single();
 if(asset.error)throw Error('Readings unavailable');
 if(asset.data.machine?.assetcareReadings?.length)return asset.data.machine.assetcareReadings;
 const at=Date.parse(asset.data.received_at);if(!Number.isFinite(at))return [];
 const batches=await db.from('assetcare_batches').select('items').gte('received_at',new Date(at-60000).toISOString()).lte('received_at',new Date(at+1000).toISOString()).order('received_at',{ascending:false}).limit(100);
 if(batches.error)throw Error('Readings unavailable');
 let latest:ReturnType<typeof assetCareReadings>=[];
 for(const batch of batches.data??[])for(const item of batch.items??[]){const rows=assetCareReadings(item,pin,process.env.ASSETCARE_OWNER_ID??'');if(rows.length&&(!latest.length||Date.parse(rows[0].time!)>Date.parse(latest[0].time!)))latest=rows;}
 return latest;
}
