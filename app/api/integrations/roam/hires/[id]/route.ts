import type {NextRequest} from 'next/server';
import {authorizeOperations} from '@/lib/fleet-operations/server';
import {jcbJson,jcbError} from '@/lib/integrations/jcb/server';
import {readRoamHire} from '@/lib/integrations/roam/hires-server';
export const maxDuration=60;
export async function GET(request:NextRequest,context:{params:Promise<{id:string}>}){try{await authorizeOperations(request);const {id}=await context.params;return jcbJson(await readRoamHire(id))}catch(e){return jcbError(e)}}
