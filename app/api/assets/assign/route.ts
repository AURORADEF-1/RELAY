import type {NextRequest} from 'next/server';
import {authorizeAssets} from '@/lib/assets/access';
import {assetJobSchema,jobDetails,locationShare} from '@/lib/assets/share';
import {allRows} from '@/lib/fleet-operations/server';
import {getLinkedFleet,jcbJson,jcbError} from '@/lib/integrations/jcb/server';
import {getLinkedTrackunitFleet} from '@/lib/integrations/trackunit/server';
import {getLinkedTakeuchiFleet} from '@/lib/integrations/takeuchi/server';
import {getAssetCareFleet} from '@/lib/integrations/assetcare/server';
import {JcbError} from '@/lib/integrations/jcb/client';
export const maxDuration=60;
type Auth=Awaited<ReturnType<typeof authorizeAssets>>;
async function fitters(auth:Auth){
 const [access,profiles]=await Promise.all([allRows<{user_id:string;enabled:boolean}>(auth.supabase,'jcb_livelink_access','user_id,enabled','user_id'),allRows<{id:string;full_name:string|null;role:string;interface_mode:string|null}>(auth.supabase,'profiles','id,full_name,role,interface_mode','id')]);
 const ids=new Set(access.filter(a=>a.enabled).map(a=>a.user_id));
 return profiles.filter(p=>ids.has(p.id)&&['requester','user','admin'].includes(p.role)&&p.interface_mode!=='front_counter').map(p=>({id:p.id,name:p.full_name||'Unnamed fitter'})).sort((a,b)=>a.name.localeCompare(b.name));
}
export async function GET(request:NextRequest){try{const auth=await authorizeAssets(request,true);return jcbJson({fitters:await fitters(auth)});}catch(e){return jcbError(e);}}
export async function POST(request:NextRequest){try{
 const auth=await authorizeAssets(request,true),parsed=assetJobSchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)throw new JcbError('Enter a fitter, job number, breakdown description, site contact and valid phone number.',400);
 const input=parsed.data,prefix=jobDetails(input);
 const existing=await auth.supabase.from('user_tasks').select('id,assigned_by,assigned_to,description').eq('id',input.requestId).maybeSingle();
 if(existing.error)throw new JcbError('Unable to check job assignment. Please retry.',503);
 if(existing.data){if(existing.data.assigned_by!==auth.user.id||existing.data.assigned_to!==input.fitterId||!existing.data.description?.startsWith(prefix))throw new JcbError('This submission was already saved with different details. Start a new assignment.',409);return jcbJson({id:existing.data.id,alreadySaved:true});}
 if(!(await fitters(auth)).some(f=>f.id===input.fitterId))throw new JcbError('Choose an enabled internal fitter.',400);
 const fleet=input.provider==='assetcare'?await getAssetCareFleet():input.provider==='takeuchi'?await getLinkedTakeuchiFleet(auth):input.provider==='trackunit'?await getLinkedTrackunitFleet(auth):await getLinkedFleet(auth);
 const matches=fleet.machines.filter(m=>m.pin===input.pin);if(matches.length!==1)throw new JcbError('Asset could not be identified. Refresh the fleet view.',404);
 const m=matches[0],share=locationShare(m);if(!share)throw new JcbError('This asset has no valid location to share.',400);
 const result=await auth.supabase.from('user_tasks').insert({id:input.requestId,title:`Job ${input.jobNumber} · ${m.relay?.machine_number||m.equipmentId}`.slice(0,250),description:prefix+share.text,status:'OPEN',assigned_to:input.fitterId,assigned_by:auth.user.id,read_at:null,completed_at:null}).select('id').single();
 if(result.error)throw new JcbError('Unable to confirm assignment. Retry with the same details; a saved job will not be duplicated.',503);
 return jcbJson({id:result.data.id},201);
 }catch(e){return jcbError(e);}}
