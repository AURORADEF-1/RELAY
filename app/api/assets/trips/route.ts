import type {NextRequest} from 'next/server';
import {authorizeAssets} from '@/lib/assets/access';
import {operationsDatabase} from '@/lib/fleet-operations/server';
import {JcbError} from '@/lib/integrations/jcb/client';
import {jcbError} from '@/lib/integrations/jcb/server';

export const maxDuration=60;

export async function GET(request:NextRequest){try{
 await authorizeAssets(request,true);
 const q=request.nextUrl.searchParams,now=Date.now();
 const endValue=q.get('to'),startValue=q.get('from');
 const end=endValue?Date.parse(endValue):now+1;
 const start=startValue?Date.parse(startValue):now-7*86400000;
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>32*86400000||end>now+86400000)throw new JcbError('Choose a valid date range of up to 32 days.',400);
 const owner=process.env.ASSETCARE_OWNER_ID;
 if(!owner)throw new JcbError('AssetCare+ trip history is not configured.',503);
 const asset=q.get('asset')?.trim()||null;
 if(asset&&asset.length>200)throw new JcbError('Invalid asset reference.',400);
 const result=await operationsDatabase().rpc('assetcare_trip_history',{p_owner:owner,p_start:new Date(start).toISOString(),p_end:new Date(end).toISOString(),p_asset:asset});
 if(result.error||!result.data||!Array.isArray(result.data.trips))throw new JcbError('Trip history is unavailable. Please retry.',503);
 if(result.data.trips.length>2000)throw new JcbError('Too many trips. Choose a shorter date range.',422);
 return Response.json(result.data,{headers:{'Cache-Control':'private, no-store','Vary':'Authorization'}});
 }catch(error){return jcbError(error);}}
