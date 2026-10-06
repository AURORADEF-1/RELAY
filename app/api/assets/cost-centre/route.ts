import type {NextRequest} from 'next/server';
import {authorizeAssets} from '@/lib/assets/access';
import {operationsDatabase} from '@/lib/fleet-operations/server';
import {assetGroupKeys} from '@/lib/fleet-map/groups';
import {jcbError,jcbJson} from '@/lib/integrations/jcb/server';
import {JcbError} from '@/lib/integrations/jcb/client';

const costCentres=['Hydraulic Services','Non Shared','Operators','Plant','Plant Office','Stock','Transport','Workshop','Yard'] as const;
const categories:Record<(typeof costCentres)[number],string>={
 'Hydraulic Services':'Plant','Non Shared':'People',Operators:'People',Plant:'Plant','Plant Office':'People',Stock:'Stock',Transport:'Vehicles',Workshop:'People',Yard:'People'
};

export async function POST(request:NextRequest){try{
 await authorizeAssets(request,true);
 const body=await request.json().catch(()=>null) as {label?:unknown;costCentre?:unknown}|null;
 if(!body||typeof body.label!=='string'||body.label.trim().length<1||body.label.length>250||typeof body.costCentre!=='string'||!costCentres.includes(body.costCentre as (typeof costCentres)[number]))throw new JcbError('Choose a valid cost centre.',400);
 const costCentre=body.costCentre as (typeof costCentres)[number],rows=assetGroupKeys(body.label).map(lookup_hash=>({lookup_hash,cost_centre:costCentre,category:categories[costCentre],imported_at:new Date().toISOString()}));
 const result=await operationsDatabase().from('fleet_asset_groups').upsert(rows,{onConflict:'lookup_hash'});
 if(result.error)throw new JcbError('Unable to save the cost centre. Please retry.',503);
 return jcbJson({saved:true,costCentre,category:categories[costCentre]});
 }catch(error){return jcbError(error);}}
