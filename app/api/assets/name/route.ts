import type {NextRequest} from 'next/server';
import {authorizeAssets} from '@/lib/assets/access';
import {operationsDatabase} from '@/lib/fleet-operations/server';
import {JcbError} from '@/lib/integrations/jcb/client';
import {jcbError,jcbJson} from '@/lib/integrations/jcb/server';

export async function POST(request:NextRequest){try{
 await authorizeAssets(request,true,['admin','transport','office','workshop']);
 const body=await request.json().catch(()=>null) as {pin?:unknown;name?:unknown}|null;
 if(!body||typeof body.pin!=='string'||!body.pin.trim()||body.pin.length>250||typeof body.name!=='string')throw new JcbError('Enter a valid asset name.',400);
 const name=body.name.trim();
 if(!name||name.length>250)throw new JcbError('The asset name must be between 1 and 250 characters.',400);
 const db=operationsDatabase(),existing=await db.from('assetcare_assets').select('machine').eq('asset_id',body.pin.trim()).maybeSingle();
 if(existing.error)throw new JcbError('Unable to load the asset name. Please retry.',503);
 if(!existing.data)throw new JcbError('Asset not found. Refresh the fleet and retry.',404);
 const machine=existing.data.machine&&typeof existing.data.machine==='object'&&!Array.isArray(existing.data.machine)?existing.data.machine as Record<string,unknown>:{};
 const result=await db.from('assetcare_assets').update({machine:{...machine,equipmentId:name,nameOverride:name}}).eq('asset_id',body.pin.trim()).select('asset_id').maybeSingle();
 if(result.error)throw new JcbError('Unable to save the asset name. Please retry.',503);
 if(!result.data)throw new JcbError('Asset changed while saving. Refresh and retry.',409);
 return jcbJson({saved:true,name});
 }catch(error){return jcbError(error);}}
