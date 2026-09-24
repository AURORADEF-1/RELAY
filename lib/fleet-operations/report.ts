import yard from './yard.json';
import type { LinkedJcbMachine, Reading } from '@/lib/integrations/jcb/types';
export type HireStatus = 'on_hire' | 'off_hire' | 'unknown';
export type Snapshot = { captured_at: string; payload: LinkedJcbMachine };
export const DAY=86_400_000;
export function positionSide(position: LinkedJcbMachine['position'], now:number):HireStatus {
  if(!position || !position.at) return 'unknown';
  const age=now-Date.parse(position.at);
  const {latitude:y,longitude:x}=position;
  if(!Number.isFinite(age)||age<0||age>DAY||!Number.isFinite(x)||!Number.isFinite(y)||Math.abs(x)>180||Math.abs(y)>90||(x===0&&y===0))return 'unknown';
  const ring=yard.geometry.coordinates[0];let inside=false;
  // Local metre projection is used only for the 20 m GPS uncertainty band.
  const scaleX=111320*Math.cos(y*Math.PI/180),scaleY=111320;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const [ax,ay]=ring[j], [bx,by]=ring[i];
    const dx=(bx-ax)*scaleX,dy=(by-ay)*scaleY,px=(x-ax)*scaleX,py=(y-ay)*scaleY;
    const t=Math.max(0,Math.min(1,(px*dx+py*dy)/(dx*dx+dy*dy||1)));
    if(Math.hypot(px-t*dx,py-t*dy)<=20)return 'unknown';
    if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)inside=!inside;
  }
  return inside?'off_hire':'on_hire';
}
export function hireState(samples:Snapshot[],now:number){
  const points=[...new Map(samples.filter(s=>s.payload.position?.at).map(s=>[s.payload.position!.at!,s.payload.position!])).values()].filter(p=>Number.isFinite(Date.parse(p.at!))&&Date.parse(p.at!)<=now).sort((a,b)=>Date.parse(a.at!)-Date.parse(b.at!));
  let lastKnown:HireStatus='unknown',lastKnownAt:string|null=null;
  for(let i=0;i<points.length;i++){
    const time=Date.parse(points[i].at!),side=positionSide(points[i],time);
    if(side==='unknown')continue;
    // A first valid observation establishes status. Only a change of side needs
    // a second distinct, recent observation; repeated cached timestamps cannot confirm it.
    if(lastKnown==='unknown'||side===lastKnown||(i>0&&positionSide(points[i-1],time)===side)){
      lastKnown=side;lastKnownAt=points[i].at;
    }
  }
  const current=samples.at(-1)?.payload.position,latest=points.at(-1);
  const at=Date.parse(current?.at??''),age=now-at;
  let state:'current'|'stale'|'missing'|'invalid'|'boundary'|'crossing'='current';
  if(!current)state='missing';
  else if(!Number.isFinite(at)||age<0||!Number.isFinite(current.latitude)||!Number.isFinite(current.longitude)||Math.abs(current.latitude)>90||Math.abs(current.longitude)>180||(current.latitude===0&&current.longitude===0))state='invalid';
  else if(age>DAY)state='stale';
  else if(positionSide(current,now)==='unknown')state='boundary';
  else if(positionSide(current,now)!==lastKnown)state='crossing';
  const status:HireStatus=state==='current'?positionSide(current!,now):'unknown';
  const reasons={current:'Based on latest valid location',stale:'GPS location is over 24 hours old',missing:'No current GPS reading',invalid:'GPS reading is invalid or has no valid timestamp',boundary:'Within 20 metres of the yard boundary',crossing:'Awaiting a second GPS report to confirm yard crossing'};
  return {status,lastKnown,lastKnownAt,position:current??latest??null,state,reason:reasons[state]};
}
export function hireLabel(hire:ReturnType<typeof hireState>){
  if(hire.status==='on_hire')return 'On hire';
  if(hire.status==='off_hire')return 'Off hire';
  return {current:'Location unavailable',stale:'Not checked in',missing:'No GPS location',invalid:'Invalid GPS',boundary:'Near yard boundary',crossing:'Awaiting crossing update'}[hire.state];
}

type Metric = 'fuelUsed'|'hours'|'idleHours';
type Interval = {start:number;end:number;value:number};
function intervals(samples:Snapshot[],metric:Metric,from:number,to:number):Interval[]{
  const readings=new Map<number,Reading<number>>();
  for(const s of samples){const r=s.payload[metric];const at=Date.parse(r?.at??'');if(r&&Number.isFinite(r.value)&&r.value>=0&&Number.isFinite(at)&&at<=to)readings.set(at,r);}
  const sorted=[...readings].sort((a,b)=>a[0]-b[0]),result:Interval[]=[];
  for(let i=1;i<sorted.length;i++){
    const [start,a]=sorted[i-1],[end,b]=sorted[i];const value=b.value-a.value,elapsed=(end-start)/3600000;
    // Do not prorate crossing intervals, bridge long gaps, or count counter resets.
    if(start<from||end>to||end-start>2*DAY||value<0||metric!=='fuelUsed'&&value>elapsed+0.1)continue;
    result.push({start,end,value});
  }
  return result;
}
export function operationalReport(samples:Snapshot[],from:number,to:number,options:{estimateFromLastKnown?:boolean}={}){
  const fuel=intervals(samples,'fuelUsed',from,to),hours=intervals(samples,'hours',from,to),idle=intervals(samples,'idleHours',from,to);
  const total=(rows:Interval[])=>rows.length?rows.reduce((a,b)=>a+b.value,0):null;
  const aligned=(a:Interval[],b:Interval[])=>a.flatMap(x=>{const y=b.find(y=>y.start===x.start&&y.end===x.end);return y?[{a:x.value,b:y.value}]:[];});
  const fuelHours=aligned(fuel,hours),idleHours=aligned(idle,hours).filter(x=>x.a<=x.b);
  const denominator=fuelHours.reduce((n,p)=>n+p.b,0),idleDenominator=idleHours.reduce((n,p)=>n+p.b,0);
  // GPS and counters are sampled independently. Prefer a complete bracket;
  // permit a labelled estimate only with two distinct observations within 15
  // minutes of the endpoints, no observed crossing and no long GPS gaps.
  let yardFuel=0,onHireFuel=0,unattributedFuel=0,timingEstimatedFuel=0,statusEstimatedFuel=0;
  const unattributedReasons={missingStart:0,missingEnd:0,gpsGap:0,invalidPosition:0,crossing:0};
  const positions=samples.flatMap(s=>s.payload.position?.at?[s.payload.position]:[])
    .filter(p=>Number.isFinite(Date.parse(p.at!))&&Date.parse(p.at!)<=to).sort((a,b)=>Date.parse(a.at!)-Date.parse(b.at!));
  for(const f of fuel){
    const at=(p:NonNullable<LinkedJcbMachine['position']>)=>Date.parse(p.at!);
    let before=positions.filter(p=>at(p)<=f.start).at(-1),after=positions.find(p=>at(p)>=f.end);
    const bracket=before&&after&&f.start-at(before)<=3600000&&at(after)-f.end<=3600000;
    const closest=(target:number)=>positions.reduce<typeof before>((best,p)=>!best||Math.abs(at(p)-target)<Math.abs(at(best)-target)?p:best,undefined);
    let estimated=false;
    if(!bracket){
      const start=closest(f.start),end=closest(f.end);
      if(start&&end&&at(start)<at(end)&&Math.abs(at(start)-f.start)<=15*60000&&Math.abs(at(end)-f.end)<=15*60000){before=start;after=end;estimated=true;}
    }
    let reason:keyof typeof unattributedReasons|null=null;
    if(!bracket&&!estimated){
      if(!before||f.start-at(before)>3600000)reason='missingStart';
      else if(!after||at(after)-f.end>3600000)reason='missingEnd';
      else reason='gpsGap';
    }
    const all=before&&after?positions.filter(p=>at(p)>=Math.min(at(before),f.start)&&at(p)<=Math.max(at(after),f.end)):[];
    const sides=all.map(p=>positionSide(p,at(p))),side=sides[0];
    if(!reason&&all.some((p,i)=>i>0&&at(p)-at(all[i-1])>2*3600000))reason='gpsGap';
    if(!reason&&(!sides.length||sides.includes('unknown')))reason='invalidPosition';
    if(!reason&&sides.some(s=>s!==side))reason='crossing';
    if(reason){
      // Explicit operational estimate: use the latest valid reported side, even
      // when stale or observed after the interval. Never call this observed fuel.
      const last=options.estimateFromLastKnown?positions.filter(p=>positionSide(p,at(p))!=='unknown').at(-1):undefined;
      if(last){if(positionSide(last,at(last))==='off_hire')yardFuel+=f.value;else onHireFuel+=f.value;statusEstimatedFuel+=f.value;}
      else {unattributedFuel+=f.value;unattributedReasons[reason]+=f.value;}
    }
    else {if(side==='off_hire')yardFuel+=f.value;else onHireFuel+=f.value;if(estimated)timingEstimatedFuel+=f.value;}
  }
  return {fuelLitres:total(fuel),engineHours:total(hours),idleHours:total(idle),litresPerHour:denominator>0?fuelHours.reduce((n,p)=>n+p.a,0)/denominator:null,idlePercent:idleDenominator>0?idleHours.reduce((n,p)=>n+p.a,0)/idleDenominator*100:null,nonIdleHours:idleHours.length?idleHours.reduce((n,p)=>n+p.b-p.a,0):null,yardFuel:fuel.length?yardFuel:null,onHireFuel:fuel.length?onHireFuel:null,unattributedFuel:fuel.length?unattributedFuel:null,timingEstimatedFuel,statusEstimatedFuel,unattributedReasons,fuelIntervals:fuel.length,hoursIntervals:hours.length,fuelCoverageHours:fuel.reduce((n,p)=>n+(p.end-p.start)/3600000,0),firstObserved:samples[0]?.captured_at??null};
}
export type OpenPartsRequest={id:string;jobNumber:string|null;status:string};
export type OperationRow={openPartsRequests:OpenPartsRequest[]|null;machine:LinkedJcbMachine;hire:ReturnType<typeof hireState>;report:ReturnType<typeof operationalReport>};
export function csvCell(value:unknown){const s=value===null||value===undefined?'':String(value);return '"'+(/^[\s]*[=+@-]/.test(s)?"'":'')+s.replaceAll('"','""')+'"';}
