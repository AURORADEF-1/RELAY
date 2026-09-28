import type {NextRequest} from 'next/server';
import {fleetForViewer} from '@/lib/fleet-map/requester-server';
import {answerRequesterFleet} from '@/lib/relay-ai-fleet';
import {isTelematicsQuestion} from '@/lib/relay-ai-telematics';
import {jcbJson,jcbError} from '@/lib/integrations/jcb/server';
export const maxDuration=60;
export async function GET(request:NextRequest){
 const question=request.nextUrl.searchParams.get('question')?.trim()??'';
 if(!question||question.length>1000||!isTelematicsQuestion(question))return jcbJson({error:'Ask a fleet location or directions question (up to 1,000 characters).'},400);
 try{const fleet=await fleetForViewer(request,true);if(fleet.sources.every(s=>!s.available))return jcbJson({error:'Fleet tracking is unavailable. Please retry.'},503);return jcbJson(answerRequesterFleet(question,fleet));}catch(error){return jcbError(error);}
}
