import { z } from "zod";
import { timestamp } from "../jcb/normalize";
import type { JcbFault, JcbMachine, LinkedJcbMachine, RegistryMachine } from "../jcb/types";
export const unitSchema = z.object({
  id: z.string().min(1).max(100), referenceNumber: z.string().nullish(), name: z.string().nullish(),
  gpsFixTime: z.string().nullish(), location: z.object({ latitude: z.number(), longitude: z.number() }).nullish(),
});
export const telemetrySchema = z.object({ name: z.string(), value: z.union([z.string(),z.number(),z.boolean()]).nullable(), time: z.string().nullish(), uoM: z.string().nullish() });
export type Telemetry = z.infer<typeof telemetrySchema>;
export type TrackunitMachine = JcbMachine & { unitId: string };
export function normalizeUnit(raw: z.infer<typeof unitSchema>): TrackunitMachine {
  const pos = raw.location;
  return { source: "trackunit", unitId: raw.id, pin: raw.referenceNumber?.trim() || `unit:${raw.id}`, equipmentId: raw.name?.trim() || raw.id,
    model: "Model not supplied", position: pos && Math.abs(pos.latitude)<=90 && Math.abs(pos.longitude)<=180 && !(pos.latitude===0 && pos.longitude===0) ? {...pos,at:timestamp(raw.gpsFixTime)} : null,
    hours:null,idleHours:null,fuel:null,adblue:null,engine:null };
}
const identity = (s?: string | null) => (s??"").replace(/\s+/g,"").toUpperCase();
export function linkTrackunitMachines(machines: TrackunitMachine[], registry: RegistryMachine[], mappings: {pin:string;machine_id:string}[]): LinkedJcbMachine[] {
  return machines.map(raw => {
    const {pin,equipmentId,model,position,hours,idleHours,fuel,adblue,engine,source}=raw;
    const machine={pin,equipmentId,model,position,hours,idleHours,fuel,adblue,engine,source};
    const manual=mappings.find(m=>m.pin===machine.pin);
    const candidates=manual ? registry.filter(r=>r.id===manual.machine_id) : registry.filter(r=>
      identity(r.make).startsWith("MANITOU") && !mappings.some(m=>m.machine_id===r.id && m.pin!==machine.pin) &&
      (identity(r.serial_number)===identity(machine.pin) || (identity(r.machine_number)===identity(machine.equipmentId) && (!r.serial_number?.trim() || identity(r.serial_number)===identity(machine.pin)))));
    const relay=candidates.length===1?candidates[0]:null;
    const collision=!manual && relay && machines.filter(m=>identity(m.pin)===identity(relay.serial_number)||identity(m.equipmentId)===identity(relay.machine_number)).length>1;
    return {...machine,model:relay?.model||machine.model,relay:collision?null:relay,match:collision||candidates.length>1?"ambiguous":relay?manual?"confirmed":"exact":"unmatched"};
  });
}
export function applyTelemetry<T extends JcbMachine | LinkedJcbMachine>(machine:T, telemetry:Telemetry[]):T {
  const reading=(names:string[],units:string[],max=Infinity)=>{
    const rows=telemetry.filter(t=>names.includes(t.name.trim().toLowerCase()) && units.includes((t.uoM??"").trim().toLowerCase())).sort((a,b)=>(Date.parse(b.time??"")||0)-(Date.parse(a.time??"")||0));
    const t=rows[0];const n=t && (typeof t.value==='number'||typeof t.value==='string'&&t.value.trim()) ? Number(t.value):NaN;
    return Number.isFinite(n)&&n>=0&&n<=max ? {value:n,at:timestamp(t.time)}:null;
  };
  return {...machine,hours:reading(['total machine hours','engine total hours of operation'],['h','hr','hours','hour']),fuel:reading(['fuel level'],['%','percent'],100),adblue:reading(['adblue level','diesel exhaust fluid tank level'],['%','percent'],100)};
}
export const faultSchema=z.object({time:z.string().nullish(),spn:z.number().int().nonnegative(),fmi:z.number().int().nonnegative(),description:z.string().nullish(),name:z.string().nullish(),occurrenceCount:z.number().nullish()});
export function normalizeFault(raw:z.infer<typeof faultSchema>):JcbFault {
  return {code:`SPN ${raw.spn} / FMI ${raw.fmi}`,description:raw.description||raw.name||'No description supplied',severity:'Not supplied',at:timestamp(raw.time)};
}
