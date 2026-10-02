import {directionsForPosition} from '@/lib/relay-ai-fleet';
import { buildYardReport } from '@/lib/yard-report';
import { lastKnown,positionOrder,usableCoordinates } from '@/lib/plant-wallboard/positions';
import type { loadPlantSnapshot } from '@/lib/plant-wallboard/snapshot';
export function isTelematicsQuestion(question:string){
 return /\b(directions?|navigate|telematics|tracking|trackers?|gps|yard|departures?|arrivals?|returned|returns|turnaround|redeployment|plant summary|fleet summary|director summary)\b/i.test(question)
  || /\b(where|location|located)\b/i.test(question)&&/\b(machine|asset|plant|fleet|\d{4,6})\b/i.test(question);
}
const uk=(at:string|number)=>new Date(at).toLocaleString('en-GB',{timeZone:'Europe/London',dateStyle:'short',timeStyle:'short'});
type Snapshot=Awaited<ReturnType<typeof loadPlantSnapshot>>;
export function answerTelematics(question:string,snapshot:Snapshot){
 const {data,positions,machines,events,now}=snapshot;
 const sourceNote=`Saved RELAY plant tracking · checked ${uk(data.checkedAt)} UK time. Active owned linked plant only. Last-known location is not proof of current hire or availability.${data.warning?' '+data.warning:''}`;
 const result=(text:string,facts:string[]=[],directions:ReturnType<typeof directionsForPosition>=null)=>({text:directions?`${text}\n\nNeed directions? Use the button below to open this last-known position in Google Maps.`:text,facts,sourceNote,copyText:text,directions});
 if(/\b(assign|reassign|delete|disable|move|change|update)\b/i.test(question))return result('Tracking questions are read-only. I can show the saved position, yard movements and tracking gaps; I cannot assign trackers or alter asset records.');
 if(/\b(yesterday|last week|last month|last year|20\d{2}-\d{2}-\d{2})\b/i.test(question))return result('I can report today, this week or this month here. Use Reports → Yard movements for another date range.');
 const refs=[...new Set(question.match(/\b\d{4,6}\b/g)??[])];
 if(refs.length>1)return result('Ask about one fleet reference at a time, or ask for a plant summary.');
 const ref=refs[0], selected=ref?positions.filter(p=>p.label===ref):positions;
 if(ref&&!selected.length)return result(`No active, owned, linked plant tracking record was found for ${ref}. This does not prove that the asset is missing or has no tracker.`);
 if(!ref&&/\b(directions?|navigate)\b/i.test(question))return result('Which machine do you need directions to? Enter its fleet number, for example “Where is machine 26227?”');
 const period=/\bmonth\b/i.test(question)?'month':/\bweek\b/i.test(question)?'week':'today';
 if(/\b(movements?|departures?|arrivals?|returned|returns|left|turnaround|redeployment)\b/i.test(question)){
  const ids=new Set(selected.map(p=>p.id)),report=buildYardReport(events.filter(e=>ids.has(e.machine_id)),data.starts[period],now,period==='month'?'month':'week');
  const recent=[...report.movements].sort((a,b)=>Date.parse(b.occurred_at)-Date.parse(a.occurred_at));
  const label=period==='today'?'Today':`This ${period}`;
  return result(`${label}${ref?' · '+ref:''}: ${report.departures} departures and ${report.returns} returns.\nAverage yard turnaround: ${report.averageYardHours==null?'not enough matched history':(report.averageYardHours/24).toFixed(1)+' days'}. Returned assets redeployed: ${report.redeploymentPercent==null?'not enough history':report.redeploymentPercent.toFixed(1)+'%'}.\n\n${recent.length?recent.slice(0,20).map(e=>`${uk(e.occurred_at)} · ${e.machine?.machine_number??selected.find(p=>p.id===e.machine_id)?.label??'Plant'} · ${e.kind==='yard_arrival'?'returned':'departed'}`).join('\n'):'No recorded movements in this period; this does not prove no activity.'}${recent.length>20?`\nShowing newest 20 of ${recent.length}; see Yard movements report for the full list.`:''}\n\nRecorded history begins ${data.historySince?uk(data.historySince):'at an unknown time'}; earlier periods may be incomplete.`,[`${report.departures} departures`,`${report.returns} returns`]);
 }
 if(ref){
  const p=selected[0],m=machines.filter(m=>m.relay?.id===p.id&&m.assetCategory==='Plant').map(m=>lastKnown(m,now)).filter(m=>usableCoordinates(m.position,now)).sort((a,b)=>positionOrder(b)-positionOrder(a))[0];
  return result(`${p.label} · ${p.model}\nLast known location: ${p.status==='yard'?'in Garboldisham yard':p.status==='out'?'outside Garboldisham yard':'unknown'}.\nGPS fix: ${p.reportedAt?uk(p.reportedAt):'time not recorded'}.${p.lastKnownOnly?' This is last-known evidence: old or undated, near the yard boundary, or conflicting; it is not a recent confirmed yard status.':''}${m?.position?`\nCoordinates: ${m.position.latitude.toFixed(6)}, ${m.position.longitude.toFixed(6)}\nProvider: ${m.source??'jcb'}`:'\nNo usable saved coordinates were found. Check the provider record and tracker assignment; the data alone cannot establish a hardware failure.'}`, [p.label,p.status==='yard'?'In yard':p.status==='out'?'Out of yard':'Location unknown'],p.status==='unknown'?null:directionsForPosition(m?.position??null,now));
 }
 if(/\b(trackers?|gps|unclear|unknown|missing|stale|offline|not checking|not checked)\b/i.test(question)){
  const missing=positions.filter(p=>p.status==='unknown'),old=positions.filter(p=>p.lastKnownOnly);
  return result(`${missing.length} plant assets have unclear locations. ${old.length} have old or undated last-known positions; that alone does not mean their trackers have failed.\n\n${missing.length?missing.slice(0,30).map(p=>`${p.label} · ${p.model} · no usable location or conflicting records`).join('\n'):'All tracked plant currently have a classified last-known location.'}${missing.length>30?'\nShowing first 30; ask for an individual fleet reference.':''}\n\nNext checks: compare the provider portal, verify the tracker-to-asset assignment, then check power and connectivity.`,[`${missing.length} unclear`,`${old.length} old/undated`]);
 }
 const status=/\b(outside|out of|out the)\b/i.test(question)?'out':/\b(in (?:the )?yard|inside)\b/i.test(question)?'yard':null;
 if(status){const rows=positions.filter(p=>p.status===status).sort((a,b)=>a.label.localeCompare(b.label));return result(`${rows.length} plant assets last known ${status==='yard'?'in the yard':'outside the yard'}.\n\n${rows.slice(0,30).map(p=>`${p.label} · ${p.model}${p.lastKnownOnly?' · old/undated GPS':''}`).join('\n')}${rows.length>30?'\nShowing first 30. Ask about a fleet reference for its location evidence.':''}`,[`${rows.length} assets`]);}
 return result(`Plant tracking summary\n${data.tracked} tracked plant: ${data.yard} last reported in the yard, ${data.out} last reported outside and ${data.unknown} with unclear location. Older and undated usable positions remain included.\nToday: ${data.today.departures} departures and ${data.today.returns} returns.\nThis week: ${data.week.departures} departures and ${data.week.returns} returns.\nThis month: ${data.month.departures} departures and ${data.month.returns} returns.\nIncluded last-known readings: ${data.lastKnown.yard} in yard and ${data.lastKnown.out} outside. Reading age is separate from location.\n\n${data.unknown?'Attention: ask “Which trackers need attention?” for the unclear assets.':'No unclassified plant locations in the current snapshot.'}\nAsk “Where is machine 26304?” or “Show today’s yard movements” for details.`,[`${data.yard} last reported in yard`,`${data.out} last reported outside`,`${data.unknown} location unclear`]);
}
