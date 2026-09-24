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
  const points=[...new Map(samples.filter(s=>s.payload.position?.at).map(s=>[s.payload.position!.at!,s.payload.position!])).values()].sort((a,b)=>Date.parse(a.at!)-Date.parse(b.at!));
  let lastKnown:HireStatus='unknown',lastKnownAt:string|null=null;
  for(let i=1;i<points.length;i++){
    const time=Date.parse(points[i].at!);
    const side=positionSide(points[i],time),prior=positionSide(points[i-1],time);
    if(side!=='unknown'&&side===prior){lastKnown=side;lastKnownAt=points[i].at;}
  }
  const latest=points.at(-1),prior=points.at(-2);
  const side=positionSide(latest??null,now);
  const status:HireStatus=side!=='unknown'&&prior&&positionSide(prior,now)===side?side:'unknown';
  return {status,lastKnown,lastKnownAt,position:latest??null,reason:!latest?'No GPS reading':positionSide(latest,now)==='unknown'?'Stale, invalid or near yard boundary':status==='unknown'?'Awaiting two distinct GPS readings':'Confirmed by two distinct GPS readings'};
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
export function operationalReport(samples:Snapshot[],from:number,to:number){
  const fuel=intervals(samples,'fuelUsed',from,to),hours=intervals(samples,'hours',from,to),idle=intervals(samples,'idleHours',from,to);
  const total=(rows:Interval[])=>rows.length?rows.reduce((a,b)=>a+b.value,0):null;
  const aligned=(a:Interval[],b:Interval[])=>a.flatMap(x=>{const y=b.find(y=>y.start===x.start&&y.end===x.end);return y?[{a:x.value,b:y.value}]:[];});
  const fuelHours=aligned(fuel,hours),idleHours=aligned(idle,hours).filter(x=>x.a<=x.b);
  const denominator=fuelHours.reduce((n,p)=>n+p.b,0),idleDenominator=idleHours.reduce((n,p)=>n+p.b,0);
  // Location allocation is conservative: every observed GPS point must support the same side,
  // with recent observations before and after the entire counter interval.
  let yardFuel=0,onHireFuel=0,unattributedFuel=0;
  const positions=samples.flatMap(s=>s.payload.position?.at?[s.payload.position]:[]).sort((a,b)=>Date.parse(a.at!)-Date.parse(b.at!));
  for(const f of fuel){
    const before=positions.filter(p=>Date.parse(p.at!)<=f.start).at(-1),after=positions.find(p=>Date.parse(p.at!)>=f.end);
    const points=positions.filter(p=>Date.parse(p.at!)>=f.start&&Date.parse(p.at!)<=f.end);
    const side=before?positionSide(before,f.start):'unknown';
    const bracket=before&&after&&f.start-Date.parse(before.at!)<=3600000&&Date.parse(after.at!)-f.end<=3600000;
    const all=bracket?[before!,...points,after!]:[];
    const sparse=all.some((p,i)=>i>0&&Date.parse(p.at!)-Date.parse(all[i-1].at!)>2*3600000);
    if(!bracket||sparse||side==='unknown'||all.some(p=>positionSide(p,Date.parse(p.at!))!==side))unattributedFuel+=f.value;
    else if(side==='off_hire')yardFuel+=f.value;else onHireFuel+=f.value;
  }
  return {fuelLitres:total(fuel),engineHours:total(hours),idleHours:total(idle),litresPerHour:denominator>0?fuelHours.reduce((n,p)=>n+p.a,0)/denominator:null,idlePercent:idleDenominator>0?idleHours.reduce((n,p)=>n+p.a,0)/idleDenominator*100:null,nonIdleHours:idleHours.length?idleHours.reduce((n,p)=>n+p.b-p.a,0):null,yardFuel:fuel.length?yardFuel:null,onHireFuel:fuel.length?onHireFuel:null,unattributedFuel:fuel.length?unattributedFuel:null,fuelIntervals:fuel.length,hoursIntervals:hours.length,fuelCoverageHours:fuel.reduce((n,p)=>n+(p.end-p.start)/3600000,0),firstObserved:samples[0]?.captured_at??null};
}
export type OperationRow={machine:LinkedJcbMachine;hire:ReturnType<typeof hireState>;report:ReturnType<typeof operationalReport>};
export function csvCell(value:unknown){const s=value===null||value===undefined?'':String(value);return '"'+(/^[\s]*[=+@-]/.test(s)?"'":'')+s.replaceAll('"','""')+'"';}
