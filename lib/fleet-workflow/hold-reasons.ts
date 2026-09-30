import type {HireAssessment} from './model';
export type HoldReason={key:string;category:'issue'|'check';tone:'critical'|'warning'|'check';title:string;detail:string;href?:string};
export type HoldEvidence={tickets:{id:string;job_number:string|null;status:string|null;request_summary:string|null}[];faults:{id:string;provider:string;detail:string;occurred_at:string;payload:{code?:string;severity?:string;providerTimestamp?:string|null}}[];jobs:{id:string;job_number:string|null;status:string|null;description:string|null}[];flags:{id:string;reason:string}[]};
export function holdReasons(row:HireAssessment,evidence:HoldEvidence):HoldReason[]{
 const reasons:HoldReason[]=[],faultGroups=new Map<string,HoldEvidence['faults']>();
 for(const b of row.blockers){
  const id=b.slice(b.indexOf(': ')+2);
  if(b.startsWith('Fault requires review: ')){
   const f=evidence.faults.find(f=>f.id===id);
   if(f){const key=`${f.provider}:${f.payload.code??'Unknown'}:${f.payload.severity??'Unknown'}`;faultGroups.set(key,[...(faultGroups.get(key)??[]),f]);}
   else reasons.push({key:b,category:'check',tone:'check',title:'Fault report needs review',detail:'Fault details unavailable. Open the machine record before clearance.',href:`/assets/${row.machine_id}`});
   continue;
  }
  if(b.startsWith('Open parts request: ')){
   const t=evidence.tickets.find(t=>t.id===id);
   // The assessment is authoritative; a concurrent completion is shown for rechecking, not as open.
   const completed=t?.status?.trim().toUpperCase()==='COMPLETED';
   reasons.push({key:b,category:completed?'check':'issue',tone:completed?'check':'warning',title:completed?'Request completed — refresh clearance':`Open parts request · ${t?.job_number||'View request'}`,detail:t?`${(t.status??'Status unknown').replaceAll('_',' ')} · ${t.request_summary||'Open the request for parts details.'}`:'Request details unavailable; open the linked request.',href:`/tickets/${id}`});continue;
  }
  if(b.startsWith('Open workshop job: ')){
   const j=evidence.jobs.find(j=>j.id===id);reasons.push({key:b,category:'issue',tone:'warning',title:`Open workshop job · ${j?.job_number||'View job'}`,detail:j?`${j.status??'Status unknown'} · ${j.description||'Inspection details in job.'}`:'Open the linked workshop job.',href:`/incidents/${id}`});continue;
  }
  if(b.startsWith('Active fleet flag: ')){reasons.push({key:b,category:'issue',tone:'warning',title:'Manual fleet flag',detail:evidence.flags.find(f=>f.id===id)?.reason||'Flag details unavailable — check the machine record.',href:`/assets/${row.machine_id}`});continue;}
  let title=b,detail='',category:HoldReason['category']='check';
  if(b==='Workshop inspection required'){title='Return inspection not signed off';detail='Workshop must record the return inspection. This does not itself mean a fault was detected.';}
  if(b==='Parts check required'){title='Parts check not signed off';detail='Parts team must confirm the return check. Open requests are listed separately.';}
  if(b==='Service schedule not recorded'){title='Service due date / hours unknown';detail='No next-service threshold is recorded. Set the service plan; this is not evidence of a missed service.';}
  if(b==='Current service hours need checking'){title='Service hours need confirmation';detail=`Next service at ${row.state?.next_service_hours} h. No valid hours reading within 48 hours; confirm the meter.`;}
  if(b==='Service due by date'){category='issue';title='Service interval reached · date';detail=`Service due ${row.state?.next_service_date}. Record the service and next due threshold before clearance.`;}
  if(b==='Service due by hours'){category='issue';title='Service interval reached · hours';detail=`${row.current_hours??'Unknown'} h recorded · service due at ${row.state?.next_service_hours} h${typeof row.current_hours==='number'&&typeof row.state?.next_service_hours==='number'?` · ${Math.max(0,row.current_hours-row.state.next_service_hours).toLocaleString('en-GB',{maximumFractionDigits:1})} h past threshold`:''}.`;}
  reasons.push({key:b,category,tone:category==='issue'?'warning':'check',title,detail});
 }
 for(const [key,group] of faultGroups){
  const f=[...group].sort((a,b)=>Date.parse(b.occurred_at)-Date.parse(a.occurred_at))[0];
  const critical=/^(critical|major|severe|fatal)$/i.test(f.payload.severity?.trim()??'');
  reasons.push({key,category:'issue',tone:critical?'critical':'warning',title:`${critical?'Priority fault report':'Fault report'} · ${f.payload.code??'Code unavailable'} · ${f.payload.severity??'Severity unknown'}`,detail:`${f.detail} · ${f.provider.toUpperCase()} · ${f.payload.providerTimestamp?`Reported ${new Date(f.payload.providerTimestamp).toLocaleString('en-GB',{timeZone:'Europe/London'})} UK time`:'Provider report time unavailable'}. Active / resolved state unconfirmed; workshop review required.${group.length>1?` ${group.length} reports of this code grouped.`:''}`,href:`/assets/${row.machine_id}`});
 }
 return reasons.sort((a,b)=>({critical:0,warning:1,check:2}[a.tone]-{critical:0,warning:1,check:2}[b.tone]));
}
