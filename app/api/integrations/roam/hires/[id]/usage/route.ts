import type {NextRequest} from 'next/server';
import {authorizeOperations} from '@/lib/fleet-operations/server';
import {jcbJson,jcbError} from '@/lib/integrations/jcb/server';
import {JcbError} from '@/lib/integrations/provider-error';
import {readRoamLifecycle} from '@/lib/integrations/roam/hires-server';
import {hireUsage} from '@/lib/integrations/roam/usage-server';
export const maxDuration=60;
export async function GET(request:NextRequest,context:{params:Promise<{id:string}>}){
 try{
  await authorizeOperations(request);const {id}=await context.params,fleet=request.nextUrl.searchParams.get('fleet');
  if(!fleet||fleet.length>100)throw new JcbError('A fleet number is required.',400);
  const matches=(await readRoamLifecycle()).filter(h=>h.id===id&&String(h.machine.fleet)===fleet);
  if(matches.length!==1)throw new JcbError('A unique asset and hire match is required.',404);
  return jcbJson(await hireUsage(matches[0]));
 }catch(e){return jcbError(e);}
}
