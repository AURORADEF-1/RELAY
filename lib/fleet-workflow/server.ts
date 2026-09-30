import 'server-only';
import type {NextRequest} from 'next/server';
import {authorizeRelayRequesterRoute} from '@/lib/integrations/rico/route-auth';
import {operationsDatabase,allRows} from '@/lib/fleet-operations/server';
import {JcbError} from '@/lib/integrations/jcb/client';
import type {HireAssessment,WorkflowAccess} from './model';
export async function authorizeWorkflow(request:NextRequest){
 const auth=await authorizeRelayRequesterRoute(request);if(!auth.ok)throw new JcbError(auth.error,auth.status);
 const db=operationsDatabase();const [profile,permission]=await Promise.all([db.from('profiles').select('role').eq('id',auth.user.id).single(),db.from('fleet_workflow_access').select('workshop,parts,hire').eq('user_id',auth.user.id).maybeSingle()]);
 if(profile.error||permission.error)throw new JcbError('Fleet workflow is not configured or access could not be checked.',503);
 const admin=profile.data.role==='admin',access:WorkflowAccess={admin,workshop:admin||permission.data?.workshop===true,parts:admin||permission.data?.parts===true,hire:admin||permission.data?.hire===true};
 if(!access.admin&&!access.workshop&&!access.parts&&!access.hire)throw new JcbError('Designated fleet workflow access required.',403);
 return {...auth,db,access};
}
export async function assessmentRows(db:ReturnType<typeof operationsDatabase>,ids:string[]){
 const rows:HireAssessment[]=[];
 for(let i=0;i<ids.length;i+=250){const r=await db.rpc('fleet_hire_assess_batch',{p_machines:ids.slice(i,i+250)});if(r.error||!Array.isArray(r.data)||r.data.length!==ids.slice(i,i+250).length)throw new JcbError('Unable to verify hire clearance.',503);rows.push(...r.data as HireAssessment[])}return rows;
}
export async function recordedAssessments(db:ReturnType<typeof operationsDatabase>){const ids=await allRows<{machine_id:string}>(db,'fleet_hire_state','machine_id','machine_id');return assessmentRows(db,ids.map(x=>x.machine_id));}
