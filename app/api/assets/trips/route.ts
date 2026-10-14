import type {NextRequest} from 'next/server';
import {authorizeAssets} from '@/lib/assets/access';
import {operationsDatabase} from '@/lib/fleet-operations/server';
import {JcbError} from '@/lib/integrations/jcb/client';
import {jcbError} from '@/lib/integrations/jcb/server';

export const maxDuration=60;
type JsonRecord=Record<string,unknown>;
const record=(value:unknown):JsonRecord=>value&&typeof value==='object'&&!Array.isArray(value)?value as JsonRecord:{};
const text=(value:unknown)=>typeof value==='string'&&value.trim()?value.trim():null;
const number=(value:unknown)=>{const parsed=typeof value==='number'?value:typeof value==='string'&&value.trim()?Number(value):NaN;return Number.isFinite(parsed)?parsed:null;};
const date=(value:unknown)=>{const parsed=text(value),time=parsed?Date.parse(parsed):NaN;return Number.isFinite(time)?new Date(time).toISOString():null;};

async function archivedTrips(db:ReturnType<typeof operationsDatabase>,owner:string,start:number,end:number,asset:string|null){
 const rows:{items:unknown;received_at:string}[]=[];
 for(let offset=0;offset<10000;offset+=500){
  const page=await db.from('assetcare_batches').select('items,received_at').gte('received_at',new Date(start-2*86400000).toISOString()).order('received_at',{ascending:false}).range(offset,offset+499);
  if(page.error)throw new JcbError('Trip history is unavailable. Please retry.',503);
  const batch=(page.data??[]) as {items:unknown;received_at:string}[];rows.push(...batch);if(batch.length<500)break;
 }
 const trips=new Map<string,JsonRecord>();
 for(const row of rows)for(const value of Array.isArray(row.items)?row.items:[]){
  const item=record(value),itemAsset=record(item.asset),itemOwner=record(item.owner);
  if(item.type!=='trip'||text(itemOwner.id)!==owner)continue;
  const assetId=text(itemAsset.id);if(!assetId||(asset&&assetId!==asset))continue;
  const endedAt=date(item.dateEnd??item.endDate),ended=endedAt?Date.parse(endedAt):NaN;
  if(!Number.isFinite(ended)||ended<start||ended>=end||ended>Date.now())continue;
  const startedAt=date(item.dateStart??item.startDate),tripStart=record(item.start),tripEnd=record(item.end),counters=record(item.counters),telemetry=record(item.telemetry);
  const id=text(item.id)??`${assetId}:${startedAt??''}:${endedAt}`;
  if(!trips.has(id))trips.set(id,{id,asset_id:assetId,asset_name:text(itemAsset.name)??assetId,started_at:startedAt,ended_at:endedAt,start_latitude:number(tripStart.lat),start_longitude:number(tripStart.lon),start_address:text(record(tripStart.gc).rt)??text(record(tripStart.gc).rd),end_latitude:number(tripEnd.lat),end_longitude:number(tripEnd.lon),end_address:text(record(tripEnd.gc).rt)??text(record(tripEnd.gc).rd),distance:number(counters.distance??item.distance),odometer:number(counters.odometer??telemetry.odometer),speed_kph:number(tripEnd.speed??telemetry.speed)});
 }
 const sorted=[...trips.values()].sort((a,b)=>String(b.ended_at).localeCompare(String(a.ended_at)));
 return {trips:sorted.slice(0,2001),archive_start:rows.at(-1)?.received_at??null,latest_saved:rows[0]?.received_at??null};
}

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
 const db=operationsDatabase(),result=await db.rpc('assetcare_trip_history',{p_owner:owner,p_start:new Date(start).toISOString(),p_end:new Date(end).toISOString(),p_asset:asset});
 const data=!result.error&&result.data&&Array.isArray(result.data.trips)?result.data:await archivedTrips(db,owner,start,end,asset);
 if(data.trips.length>2000)throw new JcbError('Too many trips. Choose a shorter date range.',422);
 return Response.json(data,{headers:{'Cache-Control':'private, no-store','Vary':'Authorization'}});
 }catch(error){return jcbError(error);}}
