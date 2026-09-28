import type {NextRequest} from 'next/server';
import {authorizeAssets} from '@/lib/assets/access';
import {operationsDatabase,ownership} from '@/lib/fleet-operations/server';
import {getAssetCareFleet} from '@/lib/integrations/assetcare/server';
import {travelSummary} from '@/lib/assets/travel';
import type {LinkedJcbMachine} from '@/lib/integrations/jcb/types';
import {jcbJson,jcbError} from '@/lib/integrations/jcb/server';
import {JcbError} from '@/lib/integrations/jcb/client';
export async function GET(request:NextRequest){try{
 // Saved GPS history and People travel information remain admin-only.
 await authorizeAssets(request,true);
 const provider=request.nextUrl.searchParams.get('provider'),pin=request.nextUrl.searchParams.get('pin');
 if(!pin||pin.length>100||!['assetcare','jcb','takeuchi','trackunit'].includes(provider??''))throw new JcbError('Select a valid tracked asset.',400);
 const db=operationsDatabase();
 if(provider==='assetcare'){
  const fleet=await getAssetCareFleet(),machine=fleet.machines.find(m=>m.pin===pin);
  if(!machine)throw new JcbError('Asset not found.',404);
  const saved=await db.from('assetcare_assets').select('position_history').eq('asset_id',pin).maybeSingle();
  if(saved.error)throw new JcbError('Travel readings unavailable.',503);
  return jcbJson(travelSummary(machine,saved.data?.position_history??[]));
 }
 const {allowed}=await ownership(db);
 const saved=await db.from('fleet_operation_samples').select('machine_id,payload').eq('provider',provider).eq('pin',pin).gte('captured_at',new Date(Date.now()-48*3600000).toISOString()).order('captured_at',{ascending:false}).limit(200);
 if(saved.error)throw new JcbError('Travel readings unavailable.',503);
 const rows=(saved.data??[]).filter(r=>allowed.has(r.machine_id));
 if(!rows.length)throw new JcbError('No saved travel readings for this asset.',404);
 const machine=rows[0].payload as LinkedJcbMachine;
 return jcbJson(travelSummary(machine,rows.map(r=>(r.payload as LinkedJcbMachine).position).filter((p):p is NonNullable<typeof p>=>!!p)));
 }catch(e){return jcbError(e);}}
