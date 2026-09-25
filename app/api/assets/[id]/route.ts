import type {NextRequest} from 'next/server';
import {authorizeAssets} from '@/lib/assets/access';
import {operationsDatabase,ownership} from '@/lib/fleet-operations/server';
import {jcbJson,jcbError} from '@/lib/integrations/jcb/server';
import {JcbError} from '@/lib/integrations/jcb/client';
import {projectMachine} from '@/lib/integrations/jcb/normalize';
import {movementHistory} from '@/lib/assets/events';
import {hireState,type Snapshot} from '@/lib/fleet-operations/report';
import {fleetReference} from '@/lib/fleet-operations/parts-requests';
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}){try{
 const auth=await authorizeAssets(request),{id}=await params,db=operationsDatabase(),{registry,allowed}=await ownership(db),machine=registry.find(m=>m.id===id);
 if(!machine||!allowed.has(id))throw new JcbError('MLP asset not found.',404);
 const mode=request.nextUrl.searchParams.get('view'),days=Number(request.nextUrl.searchParams.get('days')??7),now=Date.now();
 if(![1,7,30].includes(days))throw new JcbError('Choose 1, 7 or 30 days.',400);
 const latest=await db.from('fleet_operation_samples').select('captured_at,payload').eq('machine_id',id).order('captured_at',{ascending:false}).limit(1);
 if(latest.error)throw new JcbError('Asset readings unavailable.',503);
 const snapshot=latest.data?.[0] as Snapshot|undefined,linked=snapshot?{...snapshot.payload,relay:machine}:null;
 if(mode==='movements'){
  const samples:Snapshot[]=[];let truncated=false;
  for(let offset=0;offset<5000;offset+=500){const r=await db.from('fleet_operation_samples').select('captured_at,payload').eq('machine_id',id).eq('provider',linked?.source??'jcb').eq('pin',linked?.pin??'').gte('captured_at',new Date(now-days*86400000).toISOString()).order('captured_at',{ascending:false}).order('sample_key').range(offset,offset+499);if(r.error)throw new JcbError('Movement history unavailable.',503);samples.push(...r.data as Snapshot[]);if(r.data.length<500)break;if(offset===4500)truncated=true;}
  return jcbJson({points:movementHistory(samples,now-days*86400000,now),truncated,from:new Date(now-days*86400000).toISOString(),to:new Date(now).toISOString()});
 }
 // History follows the signed-in user's existing ticket/workshop policies.
 const reference=fleetReference(machine.machine_number),safe=machine.machine_number.replace(/[,*()"\\]/g,'').trim();
 const ambiguous=registry.filter(m=>fleetReference(m.machine_number)===reference).length!==1;
 const [tickets,incidents]=await Promise.all([
  auth.supabase.from('tickets').select('id,job_number,machine_reference,machine_number,machine_number_normalized,request_summary,status,created_at,updated_at,is_retail_sale').or(`machine_number_normalized.eq.${safe},machine_number.eq.${safe},machine_reference.eq.${safe}`).order('created_at',{ascending:false}).limit(101),
  auth.supabase.from('workshop_incidents').select('id,job_number,machine_reference,description,status,created_at,updated_at').eq('machine_reference',machine.machine_number).order('created_at',{ascending:false}).limit(101)
 ]);
 return jcbJson({machine,tracking:linked?projectMachine(linked,auth.admin):null,hire:snapshot?hireState([snapshot],now):null,checkedAt:snapshot?.captured_at??null,admin:auth.admin,
 tickets:ambiguous?[]:(tickets.data??[]).filter(t=>!t.is_retail_sale&&fleetReference(t.machine_number_normalized||t.machine_number||t.machine_reference)===reference).slice(0,100),
 incidents:ambiguous?[]:(incidents.data??[]).slice(0,100),historyLimited:(tickets.data?.length??0)>100||(incidents.data?.length??0)>100,historyUnavailable:!!tickets.error||!!incidents.error||ambiguous});
 }catch(e){return jcbError(e);}}
