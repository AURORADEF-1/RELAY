import {positionSide} from '@/lib/fleet-operations/report';
import {validPosition} from '@/lib/assets/events';
import type {LinkedJcbMachine} from '@/lib/integrations/jcb/types';
type Position=NonNullable<LinkedJcbMachine['position']>;
export function staffRow(machine:LinkedJcbMachine,history:Position[],now=Date.now()){
 const points=[...new Map([...history,...(machine.position?[machine.position]:[])].filter(p=>validPosition(p,now)).map(p=>[p.at!,p])).values()].sort((a,b)=>Date.parse(a.at!)-Date.parse(b.at!));
 // Keep the saved position until newer evidence arrives; freshness is separate from yard location.
 const saved=machine.position;
 const undated=!!saved&&!saved.at&&validPosition({...saved,at:new Date(now).toISOString()},now);
 const latest=validPosition(saved,now)||undated?saved:points.at(-1)??null;
 const lastKnown=!!latest&&(!latest.at||now-Date.parse(latest.at)>30*60000||latest!==saved);
 // The synthetic date is only for geometry classification, never returned as a GPS timestamp.
 const geometryTime=latest?.at?Date.parse(latest.at):now;
 const side=positionSide(latest?{...latest,at:new Date(geometryTime).toISOString()}:null,geometryTime);
 let status:'in'|'out'|'unknown'='unknown',reason='No valid GPS position';
 if(latest){
  if(side==='unknown')reason='Near yard boundary — awaiting a clearer position';
  else {
   const previous=latest.at?points.filter(p=>Date.parse(p.at!)<Date.parse(latest.at!)).at(-1):null;
   if(previous&&positionSide(previous,Date.parse(previous.at!))!==side)reason='Awaiting a second GPS report to confirm crossing';
   else {status=side==='off_hire'?'in':'out';reason=lastKnown?`Not checked in — last known position${latest.at?'':'; GPS time unavailable'}`:'Based on assigned vehicle GPS';}
  }
 }
 let crossing:{label:string;at:string}|null=null;
 if(points.length>=3){const last=points.slice(-3),sides=last.map(p=>positionSide(p,Date.parse(p.at!)));if(sides[0]!=='unknown'&&sides[1]!=='unknown'&&sides[0]!==sides[1]&&sides[1]===sides[2])crossing={label:sides[2]==='off_hire'?'Vehicle arrived':'Vehicle departed',at:last[2].at!};}
 return {id:machine.pin,label:machine.equipmentId,department:machine.assetGroup??'Ungrouped',status,reason,position:latest,lastKnown,crossing};
}
export type StaffRow=ReturnType<typeof staffRow>;
export type StaffData={rows:StaffRow[];checkedAt:string;warning:string|null};
