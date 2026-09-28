import type {NextRequest} from 'next/server';
import {fleetForViewer} from '@/lib/fleet-map/requester-server';
import {jcbJson,jcbError} from '@/lib/integrations/jcb/server';
export const maxDuration=60;
export async function GET(request:NextRequest){
 try{
  const result=await fleetForViewer(request);
  const unavailable=result.sources.every(source=>!source.available);
  const configured=[process.env.JCB_LIVELINK_ENABLED,process.env.TRACKUNIT_ENABLED,process.env.TAKEUCHI_ENABLED].some(value=>value==='true');
  return jcbJson(
   unavailable
    ? {...result,error:configured?'Fleet connection unavailable. Please retry.':'Fleet tracking is not configured in this environment.'}
    : result,
   unavailable?503:200,
  );
 }catch(e){return jcbError(e);}
}
