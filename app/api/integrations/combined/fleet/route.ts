import type {NextRequest} from 'next/server';
import {fleetForViewer} from '@/lib/fleet-map/requester-server';
import {jcbJson,jcbError} from '@/lib/integrations/jcb/server';
export const maxDuration=60;
export async function GET(request:NextRequest){try{const result=await fleetForViewer(request);return jcbJson(result,result.sources.every(s=>!s.available)?503:200);}catch(e){return jcbError(e);}}
