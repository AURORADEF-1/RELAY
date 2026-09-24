import type {NextRequest} from 'next/server';
import {authorizeOperations,operationsDatabase} from '@/lib/fleet-operations/server';
import {collectOperations} from '@/lib/fleet-operations/collect';
import {jcbJson,jcbError} from '@/lib/integrations/jcb/server';
export const maxDuration=300;
export async function POST(request:NextRequest){
 try{
  await authorizeOperations(request);
  const {provider}=await request.json();
  if(provider!=='jcb'&&provider!=='trackunit'&&provider!=='takeuchi')return jcbJson({error:'Choose JCB, Manitou or Takeuchi.'},400);
  const last=await operationsDatabase().from('fleet_operation_runs').select('checked_at').eq('provider',provider).order('checked_at',{ascending:false}).limit(1).maybeSingle();
  if(last.error)return jcbJson({error:'Unable to verify the previous collection.'},503);
  if(last.data&&Date.now()-Date.parse(last.data.checked_at)<15*60000)return jcbJson({recent:true});
  return jcbJson(await collectOperations(provider));
 }catch(error){return jcbError(error);}
}
