import {londonDate} from '@/lib/yard-report';
export type StaffEvent={asset_id:string;event_id:string;kind:'arrival'|'departure'|'speeding';occurred_at:string;speed_kph?:string|null;limit_kph?:string|null};
export function staffDaily(events:StaffEvent[],now:number,available=true){
 const day=londonDate(now),unique=new Map<string,StaffEvent>();
 for(const e of events)if(Number.isFinite(Date.parse(e.occurred_at))&&Date.parse(e.occurred_at)<=now&&londonDate(Date.parse(e.occurred_at))===day)unique.set(`${e.asset_id}:${e.event_id}:${e.kind}`,e);
 const sorted=[...unique.values()].sort((a,b)=>Date.parse(a.occurred_at)-Date.parse(b.occurred_at)||a.event_id.localeCompare(b.event_id));
 const movements=sorted.filter(e=>e.kind!=='speeding'),arrivals=movements.filter(e=>e.kind==='arrival'),departures=movements.filter(e=>e.kind==='departure'),last=movements.at(-1);
 const conflicting=last&&movements.some(e=>e.occurred_at===last.occurred_at&&e.kind!==last.kind);
 const alerts=sorted.filter(e=>e.kind==='speeding');
 return {day,available,firstArrival:arrivals[0]?.occurred_at??null,lastDeparture:departures.at(-1)?.occurred_at??null,lastArrival:arrivals.at(-1)?.occurred_at??null,state:!available?'unavailable':conflicting?'uncertain':last?.kind==='departure'?'not_returned':last?.kind==='arrival'?'in_yard':'no_events',movements:movements.map(e=>({kind:e.kind,at:e.occurred_at})),speedingCount:alerts.length,drivingAlerts:alerts.slice(-20).reverse().map(e=>({at:e.occurred_at,speedKph:number(e.speed_kph),limitKph:number(e.limit_kph)}))};
}
function number(v:string|null|undefined){return v!=null&&v.trim()!==''&&Number.isFinite(Number(v))&&Number(v)>=0?Number(v):null;}
export type StaffDaily=ReturnType<typeof staffDaily>;
