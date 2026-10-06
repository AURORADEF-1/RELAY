import 'server-only';
import type {NextRequest} from 'next/server';
import {authorizeRelayRequesterRoute} from '@/lib/integrations/rico/route-auth';
import {JcbError} from '@/lib/integrations/jcb/client';
import {normalizeAccessGroup,type AccessGroupId} from '@/lib/access-groups';
export async function authorizeAssets(request:NextRequest,adminOnly=false,allowedGroups?:AccessGroupId[]){
 const auth=await authorizeRelayRequesterRoute(request);if(!auth.ok)throw new JcbError(auth.error,auth.status);
 const p=await auth.supabase.from('profiles').select('role,access_group').eq('id',auth.user.id).single();if(p.error)throw new JcbError('Unable to verify asset access.',503);
 const admin=p.data.role==='admin',accessGroup=typeof p.data.access_group==='string'?normalizeAccessGroup(p.data.access_group):null;
 const explicitlyAllowed=accessGroup!==null&&allowedGroups?.includes(accessGroup)===true;
 if(allowedGroups?(accessGroup?!explicitlyAllowed:!admin):adminOnly&&!admin)throw new JcbError('This access group cannot change asset details.',403);
 if(!admin&&!explicitlyAllowed){const a=await auth.supabase.from('jcb_livelink_access').select('user_id').eq('user_id',auth.user.id).eq('enabled',true).maybeSingle();if(a.error)throw new JcbError('Unable to verify fitter access.',503);if(!a.data)throw new JcbError('Internal fitter access required.',403);}
 return {...auth,admin,accessGroup};
}
