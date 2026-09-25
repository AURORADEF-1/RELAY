import 'server-only';
import type {NextRequest} from 'next/server';
import {authorizeRelayRequesterRoute} from '@/lib/integrations/rico/route-auth';
import {JcbError} from '@/lib/integrations/jcb/client';
export async function authorizeAssets(request:NextRequest,adminOnly=false){
 const auth=await authorizeRelayRequesterRoute(request);if(!auth.ok)throw new JcbError(auth.error,auth.status);
 const p=await auth.supabase.from('profiles').select('role').eq('id',auth.user.id).single();if(p.error)throw new JcbError('Unable to verify asset access.',503);
 const admin=p.data.role==='admin';if(adminOnly&&!admin)throw new JcbError('Admin access required.',403);
 if(!admin){const a=await auth.supabase.from('jcb_livelink_access').select('user_id').eq('user_id',auth.user.id).eq('enabled',true).maybeSingle();if(a.error)throw new JcbError('Unable to verify fitter access.',503);if(!a.data)throw new JcbError('Internal fitter access required.',403);}
 return {...auth,admin};
}
