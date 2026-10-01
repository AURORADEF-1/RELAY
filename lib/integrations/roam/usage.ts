import type {RoamHire} from './hires';
export type UsageReading={value:number;at:string};
export type HireUsage={hours:number|null;source:'driver'|'telematics'|null;provider?:string;start?:UsageReading;end?:UsageReading;deliveryAt?:string;reason?:string;stale?:boolean};
export function meter(v:unknown):number|null {
 if(typeof v!=='number'&&typeof v!=='string'||v===null||String(v).trim()==='')return null;
 const n=Number(v);return Number.isFinite(n)&&n>=0?n:null;
}
export function calculateHireUsage(h:RoamHire,readings:UsageReading[],provider:string,now=Date.now()):HireUsage{
 const deliveryAt=typeof h.delivery.delivered_at==='string'?h.delivery.delivered_at:'',delivery=Date.parse(deliveryAt);
 if(h.status==='scheduled'||!Number.isFinite(delivery)||delivery>now)return {hours:null,source:null,reason:'A completed delivery timestamp is required.'};
 const collectionAt=typeof h.collection.collected_at==='string'?h.collection.collected_at:'',collection=Date.parse(collectionAt);
 const finish=Number.isFinite(collection)?collection:now;
 if(finish<delivery||finish>now)return {hours:null,source:null,reason:'The collection timestamp needs checking.'};
 const startDriver=meter(h.delivery.machine_hours),endDriver=meter(h.collection.machine_hours);
 if(Number.isFinite(collection)&&startDriver!==null&&endDriver!==null){
  return checked({value:startDriver,at:deliveryAt},{value:endDriver,at:collectionAt},'driver',deliveryAt,now);
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
 return {...checked(start,end,'telematics',deliveryAt,now),provider};
}
function checked(start:UsageReading,end:UsageReading,source:'driver'|'telematics',deliveryAt:string,now:number):HireUsage{
 const hours=end.value-start.value,elapsed=(Date.parse(end.at)-Date.parse(start.at))/3600000;
 if(hours<0||hours>elapsed+0.1)return {hours:null,source:null,deliveryAt,reason:'The hour-counter change is inconsistent with the elapsed time. Usage needs review.'};
 return {hours,source,start,end,deliveryAt,stale:source==='telematics'&&now-Date.parse(end.at)>30*60000};
}
