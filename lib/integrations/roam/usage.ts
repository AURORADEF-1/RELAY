import type {RoamHire} from './hires';
export type UsageReading={value:number;at:string;ignition?:boolean|null};
export type HireUsage={hours:number|null;source:'driver'|'telematics'|null;provider?:string;start?:UsageReading;end?:UsageReading;deliveryAt?:string;reason?:string;stale?:boolean;finalized?:boolean;collectedAt?:string;stoppedAt?:string};
export function meter(v:unknown):number|null {
 if(typeof v!=='number'&&typeof v!=='string'||v===null||String(v).trim()==='')return null;
 const n=Number(v);return Number.isFinite(n)&&n>=0?n:null;
}
export function calculateHireUsage(h:RoamHire,readings:UsageReading[],provider:string,now=Date.now()):HireUsage{
 const deliveryAt=typeof h.delivery.delivered_at==='string'?h.delivery.delivered_at:'',delivery=Date.parse(deliveryAt);
 if(h.status==='scheduled'||!Number.isFinite(delivery)||delivery>now)return {hours:null,source:null,reason:'A completed delivery timestamp is required.'};
 const collectionAt=typeof h.collection.collected_at==='string'?h.collection.collected_at:'',collection=Date.parse(collectionAt);
 const collected=Number.isFinite(collection);
 if(h.status==='collected'&&!collected)return {hours:null,source:null,deliveryAt,reason:'Collection recorded; its timestamp needs review.'};
 if(collected&&(collection<delivery||collection>now))return {hours:null,source:null,reason:'The collection timestamp needs checking.'};
 const ordered=readings.filter(r=>Number.isFinite(r.value)&&r.value>=0&&Number.isFinite(Date.parse(r.at))&&Date.parse(r.at)<=now).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
 const before=ordered.filter(r=>Date.parse(r.at)<=collection&&collection-Date.parse(r.at)<=15*60000).at(-1);
 const stop=collected?(before?.ignition===false?before:ordered.find(r=>Date.parse(r.at)>=collection&&Date.parse(r.at)-collection<=30*60000&&r.ignition===false)):undefined;
 if(collected&&!stop)return {hours:null,source:null,deliveryAt,collectedAt:collectionAt,finalized:false,reason:'Collection recorded — awaiting ignition-off confirmation near pickup. Contract hours are not finalised and transport hours are not added.'};
 const finish=stop?Date.parse(stop.at):now;
 const finalState=stop?{finalized:true,collectedAt:collectionAt,stoppedAt:new Date(Math.max(collection,finish)).toISOString(),stale:false}:{};
 const startDriver=meter(h.delivery.machine_hours),endDriver=meter(h.collection.machine_hours);
 if(collected&&startDriver!==null&&endDriver!==null){
  const result=checked({value:startDriver,at:deliveryAt},{value:endDriver,at:collectionAt},'driver',deliveryAt,now);return {...result,...(result.hours!==null?finalState:{})};
 }
 // Never subtract a driver meter value from an independently accumulated tracker counter.
 const valid=readings.filter(r=>Number.isFinite(r.value)&&r.value>=0&&Number.isFinite(Date.parse(r.at))&&Date.parse(r.at)<=finish).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
 const start=valid.filter(r=>Date.parse(r.at)<=delivery&&delivery-Date.parse(r.at)<=15*60000).at(-1);
 if(!start)return {hours:null,source:null,deliveryAt,reason:'No matching telematics hour reading within 15 minutes before delivery. Driver and tracker counters are not mixed.'};
 const end=valid.at(-1);
 if(!end||Date.parse(end.at)<=delivery)return {hours:null,source:null,deliveryAt,reason:'Awaiting a telematics hour reading after delivery.'};
 if(Number.isFinite(collection)&&collection-Date.parse(end.at)>15*60000)return {hours:null,source:null,deliveryAt,reason:'No telematics reading close enough to collection.'};
 const interval=valid.filter(r=>Date.parse(r.at)>=Date.parse(start.at));
 if(interval.some((r,i)=>i>0&&r.value<interval[i-1].value))return {hours:null,source:null,deliveryAt,reason:'The hour counter decreased. Usage needs review.'};
 const result=checked(start,end,'telematics',deliveryAt,now);return {...result,provider,...(result.hours!==null?finalState:{})};
}
function checked(start:UsageReading,end:UsageReading,source:'driver'|'telematics',deliveryAt:string,now:number):HireUsage{
 const hours=end.value-start.value,elapsed=(Date.parse(end.at)-Date.parse(start.at))/3600000;
 if(hours<0||hours>elapsed+0.1)return {hours:null,source:null,deliveryAt,reason:'The hour-counter change is inconsistent with the elapsed time. Usage needs review.'};
 return {hours,source,start,end,deliveryAt,stale:source==='telematics'&&now-Date.parse(end.at)>30*60000};
}
