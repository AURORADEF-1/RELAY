import {reportingWindow} from '@/lib/fleet-operations/window';
import {activeTicketStatuses} from '@/lib/statuses';
import {fleetReference,openRequestsByFleet,type FleetRequestTicket} from '@/lib/fleet-operations/parts-requests';
import type {NextRequest} from 'next/server';
import {authorizeOperations,operationsDatabase,ownership,eligibleMachines} from '@/lib/fleet-operations/server';
import {jcbJson,jcbError} from '@/lib/integrations/jcb/server';
import {JcbError} from '@/lib/integrations/jcb/client';
import {DAY,hireState,operationalReport,type Snapshot} from '@/lib/fleet-operations/report';
import type {LinkedJcbMachine} from '@/lib/integrations/jcb/types';
export const maxDuration=60;
export async function GET(request:NextRequest){
 try{
  const auth=await authorizeOperations(request);
  const days=Number(request.nextUrl.searchParams.get('days')||1),after=request.nextUrl.searchParams.get('after');
  if(![1,7,30].includes(days))throw new JcbError('Choose a 1, 7 or 30 day report.',400);
  const endParam=request.nextUrl.searchParams.get('to'),now=endParam?Date.parse(endParam):Date.now();
  if(!Number.isFinite(now)||now>Date.now()+60000||now<Date.now()-3600000)throw new JcbError('Report expired. Refresh to start again.',400);
  const {from,cycleEndsAt,launchAt}=reportingWindow(now,days),db=operationsDatabase();
  const [{registry,allowed},latest,runs]=await Promise.all([ownership(db),db.rpc('fleet_operations_latest').limit(1000),db.from('fleet_operation_runs').select('provider,checked_at,checked,total,failures,next_pin').order('checked_at',{ascending:false}).limit(20)]);
  if(latest.error||runs.error)throw new JcbError('Fleet Operations history is not ready yet.',503);
  if(latest.data.length>=1000)throw new JcbError('Fleet exceeds supported reporting size.',503);
  const current=(latest.data as {payload:LinkedJcbMachine;machine_id:string}[]).map(s=>({...s.payload,relay:registry.find(m=>m.id===s.machine_id)??null}));
  const machines=eligibleMachines(current,allowed).sort((a,b)=>a.relay!.id.localeCompare(b.relay!.id));
  if(after&&!machines.some(m=>m.relay!.id===after))throw new JcbError('Fleet changed during reporting. Refresh to start again.',409);
  const start=after?machines.findIndex(m=>m.relay!.id===after)+1:0,batch=machines.slice(start,start+20);
  // Read through the authenticated client's ticket policies; only return identifiers
  // for active requests linked to the verified fleet, never request/customer text.
  const tickets:FleetRequestTicket[]=[];let requestsAvailable=true;
  for(let offset=0;offset<20000;offset+=500){
    const r=await auth.supabase.from('tickets').select('id,job_number,status,machine_number_normalized,machine_number,machine_reference,is_retail_sale')
      .in('status',[...activeTicketStatuses]).order('id').range(offset,offset+499);
    if(r.error){requestsAvailable=false;break;}tickets.push(...r.data as FleetRequestTicket[]);
    if(r.data.length<500)break;if(offset===19500)requestsAvailable=false;
  }
  const requests=openRequestsByFleet(tickets,registry);
  const rows=await Promise.all(batch.map(async machine=>{
    const samples:Snapshot[]=[];
    for(let offset=0;offset<30000;offset+=500){const r=await db.from('fleet_operation_samples').select('captured_at,payload').eq('machine_id',machine.relay!.id).eq('provider',machine.source??'jcb').eq('pin',machine.pin).gte('captured_at',new Date(from-2*DAY).toISOString()).lte('captured_at',new Date(now).toISOString()).order('captured_at').order('sample_key').range(offset,offset+499);if(r.error)throw new JcbError('Reporting history unavailable.',503);samples.push(...r.data as Snapshot[]);if(r.data.length<500)break;if(offset===29500)throw new JcbError('History exceeded reporting limit.',503);}
    const withLatest=[...samples,{captured_at:new Date(now).toISOString(),payload:machine}];
    return {openPartsRequests:requestsAvailable?requests.get(fleetReference(machine.relay!.machine_number))??[]:null,machine,hire:hireState(withLatest,now),report:operationalReport(samples,from,now,{estimateFromLastKnown:true})};
  }));
  return jcbJson({cycleEndsAt:new Date(cycleEndsAt).toISOString(),launchAt:new Date(launchAt).toISOString(),rows,total:machines.length,next:start+batch.length<machines.length?batch.at(-1)!.relay!.id:null,from:new Date(from).toISOString(),to:new Date(now).toISOString(),runs:['jcb','trackunit','takeuchi'].map(p=>runs.data.find(r=>r.provider===p)??{provider:p,checked_at:null}),excludedConflicts:current.filter(m=>m.relay&&allowed.has(m.relay.id)).length-machines.length});
 }catch(error){return jcbError(error);}
}
