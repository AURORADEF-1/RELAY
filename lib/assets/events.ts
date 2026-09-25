import {positionSide,DAY,type Snapshot} from '@/lib/fleet-operations/report';
import type {JcbFault,LinkedJcbMachine} from '@/lib/integrations/jcb/types';
export type AssetEvent={event_key:string;machine_id:string;provider:string;kind:'movement'|'yard_arrival'|'yard_departure'|'fault'|'not_checked_in'|'data_unavailable';title:string;detail:string;occurred_at:string;payload:Record<string,unknown>};
export function validPosition(p:LinkedJcbMachine['position'],now=Date.now()){
 return !!p&&Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)&&Math.abs(p.latitude)<=90&&Math.abs(p.longitude)<=180&&(p.latitude!==0||p.longitude!==0)&&!!p.at&&Number.isFinite(Date.parse(p.at))&&Date.parse(p.at)<=now;
}
export function metres(a:NonNullable<LinkedJcbMachine['position']>,b:NonNullable<LinkedJcbMachine['position']>){const rad=Math.PI/180,dlat=(b.latitude-a.latitude)*rad,dlon=(b.longitude-a.longitude)*rad;const h=Math.sin(dlat/2)**2+Math.cos(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.sin(dlon/2)**2;return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));}
export function movementEvents(machine:LinkedJcbMachine,history:Snapshot[],now=Date.now()):AssetEvent[]{
 if(!machine.relay)return [];const id=machine.relay.id,provider=machine.source??'jcb',p=machine.position;
 const base={machine_id:id,provider,payload:{}};const key=`${provider}:${machine.pin}`;
 if(!validPosition(p,now))return [{...base,event_key:`${key}:missing-position`,kind:'data_unavailable',title:'Location unavailable',detail:'The provider has no valid dated position. This is not proof the machine is stationary.',occurred_at:new Date(now).toISOString()}];
 if(now-Date.parse(p!.at!)>DAY)return [{...base,event_key:`${key}:stale:${p!.at}`,kind:'not_checked_in',title:'Tracker not checked in',detail:'Last reported position is more than 24 hours old.',occurred_at:new Date(Date.parse(p!.at!)+DAY).toISOString()}];
 const points=[...new Map(history.flatMap(s=>validPosition(s.payload.position,now)?[[s.payload.position!.at!,s.payload.position!] as const]:[])).values()].filter(x=>Date.parse(x.at!)<Date.parse(p!.at!)).sort((a,b)=>Date.parse(a.at!)-Date.parse(b.at!));
 const previous=points.at(-1);if(!previous)return [];
 const side=positionSide(p,Date.parse(p!.at!)),old=positionSide(previous,Date.parse(previous.at!));
 // Confirm a boundary crossing with two distinct readings on the new side.
 const older=points.at(-2),before=older?positionSide(older,Date.parse(older.at!)):'unknown';
 let kind:AssetEvent['kind']|null=null;
 if(older&&side!=='unknown'&&side===old&&before!=='unknown'&&before!==side&&Date.parse(p!.at!)-Date.parse(previous.at!)<=2*3600000)kind=side==='off_hire'?'yard_arrival':'yard_departure';
 else if(side!=='unknown'&&side===old&&metres(previous,p!)>=300&&Date.parse(p!.at!)-Date.parse(previous.at!)<=2*3600000)kind='movement';
 if(!kind)return [];
 const titles={movement:'Movement recorded',yard_arrival:'Returned to Yard',yard_departure:'Left Garboldisham yard'};
 return [{...base,event_key:`${key}:${kind}:${p!.at}`,kind,title:titles[kind],detail:kind==='movement'?`${Math.round(metres(previous,p!))} metres between reported positions; route not recorded.`:'Confirmed by two distinct GPS reports. Location-based hire status is an estimate.',occurred_at:p!.at!,payload:{from:previous,to:p}}];
}
export function faultEvents(machine:LinkedJcbMachine,faults:JcbFault[],now=Date.now()):AssetEvent[]{
 if(!machine.relay)return [];return faults.filter(f=>!f.at||(Number.isFinite(Date.parse(f.at))&&Date.parse(f.at)<=now)).map(f=>({event_key:`${machine.source??'jcb'}:${machine.pin}:fault:${f.code}:${f.at??'undated'}`,machine_id:machine.relay!.id,provider:machine.source??'jcb',kind:'fault',title:`Reported fault ${f.code}`,detail:f.description+(!f.at?' Provider did not supply a fault timestamp; time shown is first observed by RELAY.':''),occurred_at:f.at??new Date(now).toISOString(),payload:{code:f.code,severity:f.severity,providerTimestamp:f.at}}));
}
export function movementHistory(samples:Snapshot[],from:number,to:number){
 const points=[...new Map(samples.flatMap(s=>validPosition(s.payload.position,to)&&Date.parse(s.payload.position!.at!)>=from?[[s.payload.position!.at!,s.payload.position!] as const]:[])).values()].sort((a,b)=>Date.parse(a.at!)-Date.parse(b.at!));
 return points.map((p,i)=>({...p,gapBefore:i>0&&Date.parse(p.at!)-Date.parse(points[i-1].at!)>2*3600000,metresFromPrevious:i>0?Math.round(metres(points[i-1],p)):null}));
}
