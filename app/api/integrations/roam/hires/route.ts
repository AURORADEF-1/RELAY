import type {NextRequest} from 'next/server';
import {authorizeOperations} from '@/lib/fleet-operations/server';
import {jcbJson,jcbError} from '@/lib/integrations/jcb/server';
import {readRoamHires,readRoamLifecycle} from '@/lib/integrations/roam/hires-server';
export const maxDuration=60;
export async function GET(request:NextRequest){try{await authorizeOperations(request);if(request.nextUrl.searchParams.get('completed')==='1')return jcbJson({items:(await readRoamLifecycle()).filter(h=>h.status==='collected'),next_cursor:null});return jcbJson(await readRoamHires(request.nextUrl.searchParams.get('cursor')||undefined))}catch(e){return jcbError(e)}}
