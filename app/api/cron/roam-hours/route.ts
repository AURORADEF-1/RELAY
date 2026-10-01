import type {NextRequest} from 'next/server';
import {validCronAuthorization} from '@/lib/integrations/jcb/cron-auth';
import {jcbJson,jcbError} from '@/lib/integrations/jcb/server';
import {syncRoamHours} from '@/lib/integrations/roam/hours-server';
export const maxDuration=300;
export async function GET(request:NextRequest){if(!validCronAuthorization(request.headers.get('authorization'),process.env.CRON_SECRET))return jcbJson({error:'Authentication required.'},401);try{return jcbJson(await syncRoamHours())}catch(e){return jcbError(e)}}
