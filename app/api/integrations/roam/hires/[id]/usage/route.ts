import type {NextRequest} from 'next/server';
import {authorizeOperations} from '@/lib/fleet-operations/server';
import {jcbJson,jcbError} from '@/lib/integrations/jcb/server';
import {JcbError} from '@/lib/integrations/provider-error';
import {readRoamHires} from '@/lib/integrations/roam/hires-server';
import {hireUsage} from '@/lib/integrations/roam/usage-server';
export const maxDuration=60;
export async function GET(request:NextRequest,context:{params:Promise<{id:string}>}){
 try{
  await authorizeOperations(request);const {id}=await context.params,fleet=request.nextUrl.searchParams.get('fleet');
  if(!fleet||fleet.length>100)throw new JcbError('A fleet number is required.',400);
  // One contract can contain several assets: never calculate against the first line by hire ID alone.
  let cursor:string|undefined;const seen=new Set<string>();
  for(let page=0;page<500;page++){
   const result=await readRoamHires(cursor),matches=result.items.filter(h=>h.id===id&&String(h.machine.fleet)===fleet);
   if(matches.length===1)return jcbJson(await hireUsage(matches[0]));
   if(matches.length>1)throw new JcbError('Duplicate hire lines require review.',409);
   if(!result.next_cursor)throw new JcbError('This asset is no longer in the current hire.',404);
   if(seen.has(result.next_cursor))throw new JcbError('ROAM pagination changed. Retry.',503);
   cursor=result.next_cursor;seen.add(cursor);
  }
  throw new JcbError('ROAM hire list exceeds the lookup limit.',503);
 }catch(e){return jcbError(e);}
}
