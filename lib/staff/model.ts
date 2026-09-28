import {positionSide} from '@/lib/fleet-operations/report';
import {validPosition} from '@/lib/assets/events';
import type {LinkedJcbMachine} from '@/lib/integrations/jcb/types';
type Position=NonNullable<LinkedJcbMachine['position']>;
export function staffRow(machine:LinkedJcbMachine,history:Position[],now=Date.now()){
 const points=[...new Map([...history,...(machine.position?[machine.position]:[])].filter(p=>validPosition(p,now)).map(p=>[p.at!,p])).values()].sort((a,b)=>Date.parse(a.at!)-Date.parse(b.at!));
 const latest=machine.position,age=now-Date.parse(latest?.at??'');
 const side=positionSide(latest,now);
 let status:'in'|'out'|'unknown'='unknown',reason='No valid GPS position';
 if(validPosition(latest,now)){
  if(age>30*60000)reason='Not checked in — GPS older than 30 minutes';
  else if(side==='unknown')reason='Near yard boundary — awaiting a clearer position';
  else {const previous=points.at(-2);if(previous&&positionSide(previous,Date.parse(previous.at!))!==side)reason='Awaiting a second GPS report to confirm crossing';else {status=side==='off_hire'?'in':'out';reason='Based on assigned vehicle GPS';}}
 }
 let crossing:{label:string;at:string}|null=null;
 if(points.length>=3){const last=points.slice(-3),sides=last.map(p=>positionSide(p,Date.parse(p.at!)));if(sides[0]!=='unknown'&&sides[1]!=='unknown'&&sides[0]!==sides[1]&&sides[1]===sides[2])crossing={label:sides[2]==='off_hire'?'Vehicle arrived':'Vehicle departed',at:last[2].at!};}
 return {id:machine.pin,label:machine.equipmentId,department:machine.assetGroup??'Ungrouped',status,reason,position:validPosition(latest,now)?latest:null,crossing};
}
export type StaffRow=ReturnType<typeof staffRow>;
export type StaffData={rows:StaffRow[];checkedAt:string;warning:string|null};
