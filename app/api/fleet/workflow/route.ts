import type {NextRequest} from 'next/server';
import {authorizeWorkflow,assessmentRows} from '@/lib/fleet-workflow/server';
import {workflowAction,mayAct} from '@/lib/fleet-workflow/model';
import {jcbJson,jcbError} from '@/lib/integrations/jcb/server';
import {JcbError} from '@/lib/integrations/jcb/client';
import {z} from 'zod';
export const maxDuration=60;
export async function GET(request:NextRequest){try{
 const {db,access,user}=await authorizeWorkflow(request),machine=request.nextUrl.searchParams.get('machine');
 if(machine&&!z.string().uuid().safeParse(machine).success)throw new JcbError('Invalid machine.',400);
 const query=(request.nextUrl.searchParams.get('q')??'').trim().replace(/[^a-zA-Z0-9 -]/g,'').slice(0,80);
 let registry=db.from('machines').select('id,machine_number,make,model').eq('lifecycle_status','active').order('machine_number').limit(101);
 if(machine)registry=registry.eq('id',machine);else if(query)registry=registry.ilike('machine_number',`%${query}%`);
 else {const queue=await db.from('fleet_hire_state').select('machine_id').eq('location','yard').order('updated_at',{ascending:false}).limit(101);if(queue.error)throw new JcbError('Workflow queue unavailable.',503);registry=registry.in('id',queue.data.map(r=>r.machine_id));}
 const [machines,messages]=await Promise.all([registry,db.from('fleet_workflow_messages').select('*').in('team',access.admin?['workshop','parts','hire']:['workshop','parts','hire'].filter(t=>access[t as 'workshop'|'parts'|'hire'])).order('created_at',{ascending:false}).limit(100)]);
 if(machines.error||messages.error)throw new JcbError('Workflow queue unavailable.',503);
 const rows=(await assessmentRows(db,machines.data.slice(0,100).map(m=>m.id))).filter(r=>r.status!=='excluded');
 const receipts=messages.data.length?await db.from('fleet_workflow_receipts').select('message_id').eq('user_id',user.id).in('message_id',messages.data.map(m=>m.id)):{data:[],error:null};
 if(receipts.error)throw new JcbError('Inbox status unavailable.',503);
 const audit=machine?await db.from('fleet_workflow_audit').select('id,action,reason,actor_id,created_at,payload').eq('machine_id',machine).order('created_at',{ascending:false}).limit(50):{data:[],error:null};if(audit.error)throw new JcbError('Audit history unavailable.',503);
 return jcbJson({rows,access,messages:messages.data.map(m=>({...m,read:receipts.data?.some(r=>r.message_id===m.id)})),audit:audit.data,truncated:machines.data.length>100,checkedAt:new Date().toISOString()});
 }catch(e){return jcbError(e)}}
export async function POST(request:NextRequest){try{
 const {db,access,user}=await authorizeWorkflow(request),body=await request.json().catch(()=>null);
 if(body?.action==='read'){
  if(!z.string().uuid().safeParse(body.id).success)throw new JcbError('Invalid message.',400);
  const m=await db.from('fleet_workflow_messages').select('team').eq('id',body.id).maybeSingle();if(m.error)throw new JcbError('Inbox unavailable.',503);if(!m.data||!access[m.data.team as 'workshop'|'parts'|'hire'])throw new JcbError('Message unavailable.',403);
  const r=await db.from('fleet_workflow_receipts').upsert({message_id:body.id,user_id:user.id},{onConflict:'message_id,user_id',ignoreDuplicates:true});if(r.error)throw new JcbError('Unable to mark message read.',503);return jcbJson({ok:true});
 }
 const p=workflowAction.safeParse(body);if(!p.success)throw new JcbError('Enter a valid action, reason and service details.',400);
 if(!mayAct(access,p.data.action))throw new JcbError('Your workflow role cannot perform this action.',403);
 const d=p.data,r=await db.rpc('fleet_hire_action',{p_id:d.id,p_machine:d.machineId,p_actor:user.id,p_version:d.version,p_action:d.action,p_reason:d.reason,p_payload:d.payload});
 if(r.error)throw new JcbError(r.error.code==='42501'?'This action is not permitted.':r.error.code==='40001'?'Workflow changed. Refresh before saving.':r.error.code==='P0001'?r.error.message:'Workflow action could not be completed.',r.error.code==='42501'?403:r.error.code==='40001'?409:400);
 return jcbJson({row:r.data});
 }catch(e){return jcbError(e)}}
