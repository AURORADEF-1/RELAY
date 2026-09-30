import {savedAssetCareReadings} from '@/lib/integrations/assetcare/readings-server';
import {NextRequest} from 'next/server';
import {authorizeAssets} from '@/lib/assets/access';
import {getAssetCareFleet} from '@/lib/integrations/assetcare/server';
import {jcbJson,jcbError} from '@/lib/integrations/jcb/server';
export async function GET(request:NextRequest){try{
 await authorizeAssets(request,true);
 const fleet=await getAssetCareFleet(),machine=fleet.machines.find(m=>m.pin===request.nextUrl.searchParams.get('pin'));
 if(!machine)return jcbJson({error:'Asset not found.'},404);
 let telemetry=[];let telemetryError=false;try{telemetry=await savedAssetCareReadings(machine.pin);}catch{telemetryError=true;}
 return jcbJson({machine,checkedAt:fleet.checkedAt,faults:[],faultError:true,telemetry,telemetryError});
 }catch(e){return jcbError(e);}}
