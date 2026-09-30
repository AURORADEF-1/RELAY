import type {NextRequest} from 'next/server';
import {authorizeOperations} from '@/lib/fleet-operations/server';
import {jcbJson,jcbError} from '@/lib/integrations/jcb/server';
import {readRoamPhoto} from '@/lib/integrations/roam/hires-server';
export const maxDuration=60;
export async function GET(request:NextRequest,context:{params:Promise<{id:string;photoId:string}>}){try{await authorizeOperations(request);const {id,photoId}=await context.params;return jcbJson(await readRoamPhoto(id,photoId))}catch(e){return jcbError(e)}}
