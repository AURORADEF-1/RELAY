import type {NextRequest} from 'next/server';
import {loadPlantSnapshot} from '@/lib/plant-wallboard/snapshot';
import {answerTelematics,isTelematicsQuestion} from '@/lib/relay-ai-telematics';
import {jcbJson} from '@/lib/integrations/jcb/server';
import {JcbError} from '@/lib/integrations/jcb/client';
export const maxDuration=60;
export async function GET(request:NextRequest){
 const question=request.nextUrl.searchParams.get('question')?.trim()??'';
 if(!question||question.length>1000||!isTelematicsQuestion(question))return jcbJson({error:'Ask a plant location, yard movement or tracker question (up to 1,000 characters).'},400);
 try{return jcbJson(answerTelematics(question,await loadPlantSnapshot(request)));}
 catch(error){return jcbJson({error:error instanceof JcbError?error.message:'Tracking records could not be read. Try again; no fleet conclusion is available.'},error instanceof JcbError?error.status:503);}
}
