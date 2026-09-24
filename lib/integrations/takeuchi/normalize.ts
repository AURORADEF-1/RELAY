import {z} from 'zod';
import {normalizeEquipment,timestamp} from '../jcb/normalize';
import type {JcbMachine,LinkedJcbMachine,RegistryMachine,JcbFault} from '../jcb/types';
const reading=z.record(z.string(),z.unknown()).nullish();
export const takeuchiEquipment=z.object({EquipmentHeader:z.object({PIN:z.string().min(1).max(100),EquipmentID:z.string().nullish(),SerialNumber:z.string().nullish(),OEMName:z.string(),Model:z.string().nullish()}),Location:reading,CumulativeOperatingHours:reading,CumulativeIdleHours:reading,FuelUsed:reading,FuelRemaining:reading,DEFRemaining:reading,EngineStatus:reading});
export const takeuchiLinks=z.array(z.object({rel:z.string(),href:z.string()}));
export const takeuchiFleetSchema=z.object({equipment:z.array(takeuchiEquipment).max(100),links:takeuchiLinks,snapshotTime:z.string().optional()});
export const takeuchiFaultSchema=z.object({faultCode:z.array(z.object({CodeIdentifier:z.union([z.string(),z.number()]),CodeDescription:z.string().nullish(),CodeSeverity:z.string().nullish(),datetime:z.string().nullish()})),links:takeuchiLinks});
export function normalizeTakeuchi(raw:z.infer<typeof takeuchiEquipment>):JcbMachine{
 const adapt=(r:Record<string,unknown>|null|undefined)=>r?{...r,DateTime:r.datetime}:null;
 return {...normalizeEquipment({EquipmentHeader:{Pin:raw.EquipmentHeader.PIN,EquipmentId:raw.EquipmentHeader.EquipmentID,Model:raw.EquipmentHeader.Model},Location:adapt(raw.Location),CumulativeOperatingHours:adapt(raw.CumulativeOperatingHours),CumulativeIdleHours:adapt(raw.CumulativeIdleHours),FuelUsed:adapt(raw.FuelUsed),FuelRemaining:adapt(raw.FuelRemaining),DEFRemaining:adapt(raw.DEFRemaining),EngineStatus:adapt(raw.EngineStatus)}),source:'takeuchi'};
}
const identity=(s:string|null|undefined)=>(s??'').trim().replace(/\s+/g,'').toUpperCase();
export function linkTakeuchiMachines(machines:JcbMachine[],registry:RegistryMachine[],mappings:{pin:string;machine_id:string}[]):LinkedJcbMachine[]{
 return machines.map(machine=>{const manual=mappings.find(m=>m.pin===machine.pin);const candidates=registry.filter(r=>identity(r.make).startsWith('TAKEUCHI')&&(manual?r.id===manual.machine_id:identity(r.serial_number)===identity(machine.pin)&&!mappings.some(m=>m.machine_id===r.id&&m.pin!==machine.pin)));const relay=candidates.length===1?candidates[0]:null;const collision=!!relay&&!manual&&machines.filter(m=>identity(m.pin)===identity(relay.serial_number)).length>1;return {...machine,relay:collision?null:relay,match:collision||candidates.length>1?'ambiguous':relay?manual?'confirmed':'exact':'unmatched'};});
}
export function normalizeTakeuchiFault(raw:z.infer<typeof takeuchiFaultSchema>['faultCode'][number]):JcbFault{return {code:String(raw.CodeIdentifier),description:raw.CodeDescription||'No description supplied',severity:raw.CodeSeverity||'Not supplied',at:timestamp(raw.datetime)};}
