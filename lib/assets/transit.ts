import type {LinkedJcbMachine} from '@/lib/integrations/jcb/types';
import {metres,validPosition} from '@/lib/assets/events';
export type Transit={at:string;metres:number;basis:'GPS movement'|'Distance counter';provider:string};
const recent=(at:string|null|undefined,now:number)=>!!at&&Number.isFinite(Date.parse(at))&&now-Date.parse(at)>=0&&now-Date.parse(at)<=30*60000;
export function currentTransit(machine:LinkedJcbMachine,now=Date.now()){return machine.transit&&recent(machine.transit.at,now)?machine.transit:null;}
// Two explicit ignition-off observations are required. Engine stopped is not ignition off.
export function detectTransit(current:LinkedJcbMachine,previous:LinkedJcbMachine|null|undefined,now=Date.now()):Transit|null{
 if(!previous||current.pin!==previous.pin||current.source!==previous.source||current.ignition?.value!==false||previous.ignition?.value!==false)return null;
 const a=Date.parse(previous.ignition.at??''),b=Date.parse(current.ignition.at??''),elapsed=b-a;
 if(!recent(current.ignition.at,now)||!Number.isFinite(elapsed)||elapsed<=0||elapsed>30*60000)return null;
 const aligned=(at:string|null|undefined,reference:number)=>!!at&&Math.abs(Date.parse(at)-reference)<=2*60000;
 const plausible=(distance:number)=>distance>=100&&distance/(elapsed/3600000)<=180000;
 if(current.odometer&&previous.odometer&&aligned(current.odometer.at,b)&&aligned(previous.odometer.at,a)){
  const distance=(current.odometer.value-previous.odometer.value)*1000;
  if(plausible(distance))return {at:current.ignition.at!,metres:Math.round(distance),basis:'Distance counter',provider:current.source??'jcb'};
 }
 if(validPosition(current.position,now)&&validPosition(previous.position,now)&&aligned(current.position!.at,b)&&aligned(previous.position!.at,a)){
  const distance=metres(previous.position!,current.position!);
  if(plausible(distance))return {at:current.ignition.at!,metres:Math.round(distance),basis:'GPS movement',provider:current.source??'jcb'};
 }
 return null;
}
