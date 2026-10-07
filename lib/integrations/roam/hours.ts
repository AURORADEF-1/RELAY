import {z} from 'zod';
import type {LinkedJcbMachine} from '@/lib/integrations/jcb/types';
export const hourReadingSchema=z.object({id:z.string(),machine_id:z.string(),relay_asset_id:z.uuid(),fleet_number:z.string(),hire_id:z.string().nullable(),hire_reference:z.string().nullable(),customer:z.string(),movement:z.enum(['drop_off','collection']),meter_hours:z.number().nonnegative(),recorded_at:z.iso.datetime(),driver:z.string(),drop_off_hours:z.number().nullable(),collection_hours:z.number().nullable(),used_hours:z.number().nonnegative().nullable(),usage_status:z.string(),contract_reference:z.string().nullable(),assigned_hours:z.number().nullable(),excess_hours:z.number().nullable(),contract_status:z.literal('awaiting_inspire'),yard_verification:z.string().nullable()});
export type HourReading=z.infer<typeof hourReadingSchema>;
export type RoamHourCorrection={machine_id:string;roam_source_id:string;roam_hours:number;provider_hours:number;reading_at:string};
export function applyRoamHours(machines:LinkedJcbMachine[],readings:HourReading[],corrections:RoamHourCorrection[],tolerance=.1){
 const latest=new Map<string,HourReading>();for(const r of readings){const old=latest.get(r.relay_asset_id);if(!old||r.recorded_at>old.recorded_at)latest.set(r.relay_asset_id,r);}
 const fixed=new Map(corrections.map(c=>[c.machine_id,c]));
 return machines.map(machine=>{const id=machine.relay?.id,reading=id?latest.get(id):undefined,hours=machine.hours;if(!id||!reading||!hours)return machine;const provider=machine.hoursProvider??machine.source;
  if(provider==='assetcare'){const correction=fixed.get(id);if(!correction)return machine;const value=correction.roam_hours+Math.max(0,hours.value-correction.provider_hours);return {...machine,hours:{value,at:hours.at},hoursReview:undefined};}
  if(!['jcb','trackunit','takeuchi'].includes(provider??''))return machine;const difference=Math.round(Math.abs(reading.meter_hours-hours.value)*10)/10;return difference<=tolerance?{...machine,hoursReview:undefined}:{...machine,hoursReview:{roam:reading.meter_hours,provider:hours.value,difference,readingAt:reading.recorded_at}};
 });
}
export const hoursPageSchema=z.object({schema_version:z.literal(1),revision:z.string(),total:z.number().int().nonnegative(),items:z.array(hourReadingSchema),next_offset:z.number().int().nonnegative().nullable()});
export function hoursCsv(rows:HourReading[]){const keys:(keyof HourReading)[]=['id','relay_asset_id','fleet_number','hire_id','hire_reference','customer','movement','recorded_at','driver','meter_hours','drop_off_hours','collection_hours','used_hours','usage_status','yard_verification','contract_reference','assigned_hours','excess_hours','contract_status'];const cell=(v:unknown)=>'"'+String(v??'').replace(/^[=+\-@\t\r]/,"'$&").replaceAll('"','""')+'"';return '\uFEFF'+[keys,...rows.map(r=>keys.map(k=>r[k]))].map(row=>row.map(cell).join(',')).join('\r\n');}
