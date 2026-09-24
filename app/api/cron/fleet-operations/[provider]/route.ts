import type {NextRequest} from 'next/server';
import {validCronAuthorization} from '@/lib/integrations/jcb/cron-auth';
import {jcbJson,jcbError} from '@/lib/integrations/jcb/server';
import {collectOperations} from '@/lib/fleet-operations/collect';
export const maxDuration=300;
export async function GET(request:NextRequest,{params}:{params:Promise<{provider:string}>}){
 if(!validCronAuthorization(request.headers.get('authorization'),process.env.CRON_SECRET))return jcbJson({error:'Authentication required.'},401);
 const {provider}=await params;
 if(provider!=='jcb'&&provider!=='trackunit')return jcbJson({error:'Unknown provider.'},404);
 try{return jcbJson(await collectOperations(provider));}catch(error){return jcbError(error);}
}
