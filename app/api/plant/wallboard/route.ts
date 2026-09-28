import type { NextRequest } from 'next/server';
import { loadPlantSnapshot } from '@/lib/plant-wallboard/snapshot';
import { jcbJson } from '@/lib/integrations/jcb/server';
import { JcbError } from '@/lib/integrations/jcb/client';
export const maxDuration=60;
export async function GET(request:NextRequest){
 try{return jcbJson((await loadPlantSnapshot(request)).data);}
 catch(error){return jcbJson({error:error instanceof JcbError?error.message:'Plant wallboard could not refresh. Saved figures may be out of date.'},error instanceof JcbError?error.status:503);}
}
