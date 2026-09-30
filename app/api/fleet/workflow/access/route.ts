import type {NextRequest} from 'next/server';
import {authorizeWorkflow} from '@/lib/fleet-workflow/server';
import {jcbJson,jcbError} from '@/lib/integrations/jcb/server';
import {JcbError} from '@/lib/integrations/jcb/client';
import {z} from 'zod';
export async function GET(request:NextRequest){try{
 const {db,access}=await authorizeWorkflow(request);
 if(!access.admin||request.nextUrl.searchParams.get('manage')!=='true')return jcbJson({access});
 const [users,permissions]=await Promise.all([db.from('profiles').select('id,full_name,role').order('full_name').limit(1001),db.from('fleet_workflow_access').select('user_id,workshop,parts,hire').limit(1001)]);
 if(users.error||permissions.error||users.data.length>1000||permissions.data.length>1000)throw new JcbError('Staff access list unavailable.',503);
 return jcbJson({access,users:users.data,permissions:permissions.data});
}catch(e){return jcbError(e)}}
export async function POST(request:NextRequest){try{
 const {db,access,user}=await authorizeWorkflow(request);if(!access.admin)throw new JcbError('Administrator required.',403);
 const p=z.object({userId:z.string().uuid(),workshop:z.boolean(),parts:z.boolean(),hire:z.boolean()}).strict().safeParse(await request.json().catch(()=>null));if(!p.success)throw new JcbError('Choose a staff member and permissions.',400);
 const r=await db.rpc('fleet_workflow_set_access',{p_actor:user.id,p_user:p.data.userId,p_workshop:p.data.workshop,p_parts:p.data.parts,p_hire:p.data.hire});
 if(r.error)throw new JcbError('Unable to update staff access.',503);return jcbJson({ok:true});
}catch(e){return jcbError(e)}}
