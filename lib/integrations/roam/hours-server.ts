import 'server-only';
import {operationsDatabase,allRows} from '@/lib/fleet-operations/server';
import {JcbError} from '@/lib/integrations/jcb/client';
import {hoursPageSchema,hourReadingSchema,type HourReading} from './hours';
import {getAssetCareFleet} from '@/lib/integrations/assetcare/server';
async function saveAssetCareCorrections(rows:HourReading[]){
 const latest=new Map<string,HourReading>();for(const row of rows){const old=latest.get(row.relay_asset_id);if(!old||row.recorded_at>old.recorded_at)latest.set(row.relay_asset_id,row);}
 const fleet=await getAssetCareFleet(),db=operationsDatabase(),existing=await allRows<{machine_id:string;roam_source_id:string;roam_hours:number}>(db,'roam_hour_corrections','machine_id,roam_source_id,roam_hours','machine_id');
 const saved=new Map(existing.map(row=>[row.machine_id,row]));const changes=[];
 for(const machine of fleet.machines){const id=machine.relay?.id,reading=id?latest.get(id):undefined,current=id?saved.get(id):undefined;if(!id||!reading||!machine.hours)continue;if(current?.roam_source_id===reading.id&&Number(current.roam_hours)===reading.meter_hours)continue;changes.push({machine_id:id,roam_source_id:reading.id,roam_hours:reading.meter_hours,provider_hours:machine.hours.value,reading_at:reading.recorded_at});}
 if(changes.length){const result=await db.from('roam_hour_corrections').upsert(changes,{onConflict:'machine_id'});if(result.error)throw new JcbError('ROAM readings were saved, but AssetCare+ hour corrections could not be applied.',503);}
}
export async function syncRoamHours(){
 const started=new Date().toISOString(),token=process.env.ROAM_RELAY_HIRES_TOKEN;
 if(!token)throw new JcbError('ROAM connection is not configured.',503);
 const rows:HourReading[]=[],seen=new Set<string>();let offset:number|null=0,total:number|undefined,revision:string|undefined;
 do{const response=await fetch('https://roam-henna.vercel.app/api/partners/relay/hour-readings?offset='+offset,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(25000)});if(!response.ok)throw new JcbError('ROAM hour readings are unavailable. Saved history has been retained.',503);const page=hoursPageSchema.parse(await response.json());if(total!==undefined&&(total!==page.total||revision!==page.revision))throw new JcbError('Readings changed during sync. Please retry.',503);total=page.total;revision=page.revision;for(const r of page.items){if(seen.has(r.id))throw new JcbError('Duplicate reading in ROAM response.',503);seen.add(r.id);rows.push(r);}if(page.next_offset!==null&&(page.next_offset<=offset||!page.items.length))throw new JcbError('Invalid ROAM reading page.',503);offset=page.next_offset;if(rows.length>50000)throw new JcbError('Hour history exceeds the sync limit.',503);}while(offset!==null);
 if(rows.length!==total)throw new JcbError('Incomplete hour history. Saved history retained.',503);
 const db=operationsDatabase(),result=await db.rpc('sync_roam_asset_hours',{p_rows:rows,p_started_at:started});if(result.error)throw new JcbError('Unable to save ROAM hour readings against the assets.',503);await saveAssetCareCorrections(rows);return {readings:rows.length,synced_at:started};
}
export async function savedRoamHours(machineId?:string){const db=operationsDatabase();const rows=await allRows<{payload:unknown,active:boolean}>(db,'roam_asset_hour_readings','payload,active','source_id');const meta=await db.from('roam_hours_sync').select('last_success').eq('id',true).maybeSingle();if(meta.error)throw new JcbError('Unable to read hour sync status.',503);return {items:rows.filter(r=>r.active).map(r=>hourReadingSchema.parse(r.payload)).filter(r=>!machineId||r.relay_asset_id===machineId).sort((a,b)=>b.recorded_at.localeCompare(a.recorded_at)),last_success:meta.data?.last_success||null};}
export async function roamHourRules(){const db=operationsDatabase(),[hours,corrections]=await Promise.all([savedRoamHours(),allRows(db,'roam_hour_corrections','machine_id,roam_source_id,roam_hours,provider_hours,reading_at','machine_id')]);return {readings:hours.items,corrections:corrections as import('./hours').RoamHourCorrection[]};}
