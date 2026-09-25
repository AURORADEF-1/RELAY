import {currentTransit} from './transit';
import type {Telemetry} from '@/lib/integrations/trackunit/normalize';
import type {JcbFault,LinkedJcbMachine} from '@/lib/integrations/jcb/types';
export type CardStatus={tone:'fault'|'review'|'transit'|'movement'|'running'|'unknown';label:string;detail:string;movement:string|null;transit?:string|null;checkedAt:string|null};
export const fresh=(at:string|null|undefined,age:number,now:number)=>!!at&&Number.isFinite(Date.parse(at))&&Date.parse(at)<=now&&now-Date.parse(at)<=age;
export function cardStatus(machine:LinkedJcbMachine,check:{faults:JcbFault[];checkedAt:string;complete?:boolean}|null,movement:{kind:string;occurred_at:string}|null,now=Date.now()):CardStatus{
 const move=movement&&fresh(movement.occurred_at,86400000,now)?({yard_arrival:'Returned to Yard',yard_departure:'Yard departure',movement:'Movement recorded'}[movement.kind]??'Movement recorded'):null;
 const transit=currentTransit(machine,now);
 const base={transit:transit?'In transit':null,movement:move,checkedAt:check?.checkedAt??null};
 const recent=check?.faults.some(f=>fresh(f.at,86400000,now));
 if(recent)return {...base,tone:'fault',label:'Fault reported',detail:'Fault reported within 24 hours. Check the machine for current status.'};
 if(check?.faults.length)return {...base,tone:'review',label:'Fault history — review',detail:'Older or undated fault reports. Resolution has not been confirmed.'};
 if(transit)return {...base,tone:'transit',label:'In transit',detail:`Ignition off with ${transit.metres} m reported travel. Inferred from ${transit.basis.toLowerCase()}; not a live observation.`};
 if(move)return {...base,tone:'movement',label:move,detail:'Movement recorded within 24 hours; this does not confirm the machine is healthy.'};
 const position=machine.position,located=position&&Number.isFinite(position.latitude)&&Number.isFinite(position.longitude)&&Math.abs(position.latitude)<=90&&Math.abs(position.longitude)<=180&&(position.latitude!==0||position.longitude!==0)&&fresh(position.at,86400000,now);
 if(!located)return {...base,tone:'unknown',label:'Not checked in / no GPS',detail:'Position is missing, invalid or more than 24 hours old.'};
 if(!check||check.complete===false||!fresh(check.checkedAt,90*60000,now))return {...base,tone:'unknown',label:'Health check unavailable',detail:'No complete fault check within 90 minutes. Missing data is not an all-clear.'};
 if(!fresh(machine.engine?.at,30*60000,now)||typeof machine.engine?.value!=='boolean')return {...base,tone:'unknown',label:'Running status unavailable',detail:'No recent engine-status report. No faults returned by the latest check.'};
 if(!machine.engine.value)return {...base,tone:'unknown',label:'Stopped',detail:'Engine reported stopped within 30 minutes. No faults returned by the latest check.'};
 return {...base,tone:'running',label:'Running · no faults returned',detail:'Engine reported running within 30 minutes and fault check completed within 90 minutes. Not a mechanical all-clear.'};
}

export function engineFromTelemetry(readings:Telemetry[]){
 const row=readings.filter(r=>r.name.trim().toLowerCase()==='engine speed'&&(r.uoM??'').trim().toLowerCase()==='rpm').sort((a,b)=>(Date.parse(b.time??'')||0)-(Date.parse(a.time??'')||0))[0];
 if(!row||row.value===null||typeof row.value==='boolean'||typeof row.value==='string'&&!row.value.trim())return null;
 const value=Number(row.value);return Number.isFinite(value)&&value>=0?{value:value>0,at:row.time??null}:null;
}
