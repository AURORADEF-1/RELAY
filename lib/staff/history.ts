import {londonDate} from '@/lib/yard-report';
import {ukMidnight} from '@/lib/plant-wallboard/model';
import {staffDaily,type StaffEvent} from './daily';
export function historyRange(from:string,to:string,now=Date.now()){
 const valid=(d:string)=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
 if(!valid(from)||!valid(to)||from>to||to>londonDate(now))throw Error('Choose valid dates, ending no later than today.');
 const days=(Date.parse(to)-Date.parse(from))/86400000+1;
 if(days>31)throw Error('Choose up to 31 days per export.');
 const dates=Array.from({length:days},(_,i)=>new Date(Date.parse(from)+i*86400000).toISOString().slice(0,10));
 const next=new Date(Date.parse(to)+86400000).toISOString().slice(0,10);
 return {from,to,dates,start:ukMidnight(from),end:ukMidnight(next)};
}
export const historyTime=(s:string|null)=>s?new Date(s).toLocaleString('en-GB',{timeZone:'Europe/London',hour12:false}):'Not recorded';
export function historyReport(identity:{id:string;label:string;department:string},range:ReturnType<typeof historyRange>,raw:StaffEvent[],archiveStart:string|null,latestSaved:string|null,now=Date.now(),stale=false){
 if(raw.length>10000)throw Error('Too many events. Choose a shorter date range.');
 const unique=new Map<string,StaffEvent>();
 for(const e of raw){const t=Date.parse(e.occurred_at);if(e.asset_id===identity.id&&['arrival','departure','speeding'].includes(e.kind)&&t>=range.start&&t<range.end&&t<=now)unique.set(`${e.event_id}:${e.kind}`,e);}
 const events=[...unique.values()].sort((a,b)=>Date.parse(a.occurred_at)-Date.parse(b.occurred_at)||a.event_id.localeCompare(b.event_id));
 const notes=[`UK time (Europe/London). Range: ${range.from} to ${range.to}, inclusive.`,
 `Saved archive starts: ${historyTime(archiveStart)}. Latest saved batch: ${historyTime(latestSaved)}.`,
 'Only received provider events are included. Missing events do not prove no activity or safe driving.',
 'Names and departments reflect the current vehicle assignment; the historical driver is not verified. Vehicle movements are not staff attendance.',
 'Speeding uses provider thresholds, which may differ from legal road limits. Harsh braking and cornering are unavailable.'];
 if(!archiveStart||Date.parse(archiveStart)>range.start)notes.push('INCOMPLETE COVERAGE: some or all of this range predates the saved archive.');
 if(stale||!latestSaved||now-Date.parse(latestSaved)>30*60000)notes.push('COLLECTION WARNING: saved tracking may be delayed.');
 if(range.to===londonDate(now))notes.push('Today is partial, up to report generation time.');
 const daily=range.dates.map(day=>{
 const next=new Date(Date.parse(day)+86400000).toISOString().slice(0,10);
 const d=staffDaily(events,Math.min(now,ukMidnight(next)-1));
 return {day,firstArrival:historyTime(d.firstArrival),lastDeparture:historyTime(d.lastDeparture),returnStatus:d.state==='not_returned'?'Not returned - no later arrival recorded':d.state==='uncertain'?'Conflicting events':d.state==='no_events'?'No yard events recorded':d.lastDeparture&&d.lastArrival&&Date.parse(d.lastArrival)>Date.parse(d.lastDeparture)?`Returned ${historyTime(d.lastArrival)}`:'Arrival recorded; no later departure',speedingCount:d.speedingCount};
 });
 return {...identity,from:range.from,to:range.to,generated:historyTime(new Date(now).toISOString()),notes,daily,events};
}
export type HistoryReport=ReturnType<typeof historyReport>;
export function csvCell(value:unknown){let s=String(value??'');if(/^[\s]*[=+@-]|^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
export function historyCsv(r:HistoryReport){
 const rows:unknown[][]=[['RELAY staff vehicle history'],['Current assignment',r.label],['Department',r.department],['Asset ID',r.id],['Generated (UK)',r.generated],...r.notes.map(n=>['Note',n]),[],['Daily summary'],['Day (UK)','First arrival','Last departure','Return status','Speeding alerts'],...r.daily.map(d=>[d.day,d.firstArrival,d.lastDeparture,d.returnStatus,d.speedingCount]),[],['All recorded events'],['Time (UK)','Event','Speed (km/h)','Provider threshold (km/h)','Event ID'],...r.events.map(e=>[historyTime(e.occurred_at),e.kind,e.speed_kph,e.limit_kph,e.event_id])];
 return '\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
}
