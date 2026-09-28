import type {NextRequest} from 'next/server';
import {authorizeAssets} from '@/lib/assets/access';
import {flagSchema,flagAssetKey,type AssetFlag} from '@/lib/assets/flags';
import {operationsDatabase} from '@/lib/fleet-operations/server';
import {getLinkedFleet,jcbJson,jcbError} from '@/lib/integrations/jcb/server';
import {getLinkedTrackunitFleet} from '@/lib/integrations/trackunit/server';
import {getLinkedTakeuchiFleet} from '@/lib/integrations/takeuchi/server';
import {getAssetCareFleet} from '@/lib/integrations/assetcare/server';
import {JcbError} from '@/lib/integrations/jcb/client';
export const maxDuration=60;
const columns='id,asset_key,provider,pin,machine_id,label,reason,created_at,resolved_at';
export async function GET(request:NextRequest){try{
 await authorizeAssets(request,true);
 const db=operationsDatabase(),flags:AssetFlag[]=[];
 for(let offset=0;offset<=2000;offset+=500){
  const r=await db.from('fleet_asset_flags').select(columns).is('resolved_at',null).order('id').range(offset,offset+499);
  if(r.error)throw new JcbError('Flags unavailable. Refresh before relying on map flag status.',503);
  flags.push(...(r.data??[]));
  if(flags.length>2000)throw new JcbError('Flag list exceeds the current limit. Contact an administrator.',503);
  if((r.data?.length??0)<500)return jcbJson({flags:flags.sort((a,b)=>b.created_at.localeCompare(a.created_at))});
 }
 throw new JcbError('Flag list unavailable.',503);
 }catch(e){return jcbError(e);}}
export async function POST(request:NextRequest){try{
 const auth=await authorizeAssets(request,true);
 const parsed=flagSchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)throw new JcbError('Enter a reason of 3–500 characters and a valid machine reference.',400);
 const input=parsed.data,db=operationsDatabase();
 if(input.action==='resolve'){
  const r=await db.from('fleet_asset_flags').update({resolved_at:new Date().toISOString(),resolved_by:auth.user.id,resolution:input.resolution}).eq('id',input.id).is('resolved_at',null).select('id').maybeSingle();
  if(r.error)throw new JcbError('Unable to clear flag. Refresh and retry.',503);
  if(!r.data)throw new JcbError('Flag already cleared or no longer available. Refresh the list.',409);
  return jcbJson({id:r.data.id});
 }
 const fleet=input.provider==='assetcare'?await getAssetCareFleet():input.provider==='takeuchi'?await getLinkedTakeuchiFleet(auth):input.provider==='trackunit'?await getLinkedTrackunitFleet(auth):await getLinkedFleet(auth);
 const matches=fleet.machines.filter(m=>m.pin===input.pin);
 if(matches.length!==1)throw new JcbError('Machine could not be verified in this fleet. Refresh and retry.',404);
 const machine=matches[0];
 const r=await db.from('fleet_asset_flags').insert({id:input.id,asset_key:flagAssetKey({...machine,source:input.provider}),provider:input.provider,pin:input.pin,machine_id:machine.relay?.id??null,label:`${machine.relay?.machine_number||machine.equipmentId} · ${machine.relay?.model||machine.model}`.slice(0,500),reason:input.reason,created_by:auth.user.id}).select('id').single();
 if(r.error?.code==='23505')throw new JcbError('This machine is already flagged or this submission was already saved. Refresh to see its flag.',409);
 if(r.error)throw new JcbError('Unable to confirm flag. Refresh before retrying.',503);
 return jcbJson({id:r.data.id},201);
 }catch(e){return jcbError(e);}}
