import type {NextRequest} from 'next/server';
import {operationsDatabase} from '@/lib/fleet-operations/server';
import {JcbError} from '@/lib/integrations/jcb/client';
import {jcbError} from '@/lib/integrations/jcb/server';
import {ukMidnight} from '@/lib/plant-wallboard/model';
import {tripMachinesForViewer,type TripMachine} from '@/lib/trip-history/machines';

export const maxDuration=60;
type JsonRecord=Record<string,unknown>;
const record=(value:unknown):JsonRecord=>value&&typeof value==='object'&&!Array.isArray(value)?value as JsonRecord:{};
const text=(value:unknown)=>typeof value==='string'&&value.trim()?value.trim():null;
const number=(value:unknown)=>{const parsed=typeof value==='number'?value:typeof value==='string'&&value.trim()?Number(value):NaN;return Number.isFinite(parsed)?parsed:null;};
const date=(value:unknown)=>{const parsed=text(value),time=parsed?Date.parse(parsed):NaN;return Number.isFinite(time)?new Date(time).toISOString():null;};
const dayPattern=/^\d{4}-\d{2}-\d{2}$/;
const minimumTripDistanceKm=.03*1.609344;
const nextDay=(day:string)=>new Date(Date.parse(`${day}T12:00:00Z`)+86400000).toISOString().slice(0,10);
const boundary=(value:string|null,end:boolean,otherwise:number)=>value&&dayPattern.test(value)?ukMidnight(end?nextDay(value):value):value?Date.parse(value):otherwise;
const radians=(value:number)=>value*Math.PI/180;
const segmentKm=(a:JsonRecord,b:JsonRecord)=>{const lat1=number(a.latitude),lon1=number(a.longitude),lat2=number(b.latitude),lon2=number(b.longitude);if(lat1===null||lon1===null||lat2===null||lon2===null)return 0;const dLat=radians(lat2-lat1),dLon=radians(lon2-lon1),h=Math.sin(dLat/2)**2+Math.cos(radians(lat1))*Math.cos(radians(lat2))*Math.sin(dLon/2)**2;return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));};

async function archivedTrips(db:ReturnType<typeof operationsDatabase>,owner:string,start:number,end:number,asset:string|null,search:string|null){
 let assetIds=asset?[asset]:[];
 const assetNames=new Map<string,string>();
 if(!asset&&search){
  const assets=await db.from('assetcare_assets').select('asset_id,name').limit(10000);
  if(assets.error)throw new JcbError('Trip history is unavailable. Please retry.',503);
  const matches=((assets.data??[]) as {asset_id:string;name:string}[]).filter(item=>`${item.asset_id} ${item.name}`.toLowerCase().includes(search)).slice(0,20);
  assetIds=matches.map(item=>item.asset_id);for(const item of matches)assetNames.set(item.asset_id,item.name);
  if(!assetIds.length)return {trips:[],archive_start:null,latest_saved:null};
 }
 const archiveStart=start-2*86400000,archiveEnd=Math.min(end+2*86400000,Date.now()+1000),windows:Promise<{items:unknown;received_at:string}[]>[]=[];
 for(let day=archiveStart;day<archiveEnd;day+=86400000){const dayEnd=Math.min(day+86400000,archiveEnd);windows.push((async()=>{
  const found:{items:unknown;received_at:string}[]=[];
  for(let offset=0;offset<30000;offset+=500){
   const query=db.from('assetcare_batches').select('items,received_at').gte('received_at',new Date(day).toISOString()).lt('received_at',new Date(dayEnd).toISOString());
   const page=await query.order('received_at',{ascending:false}).range(offset,offset+499);
   if(page.error)throw new JcbError('Trip history is unavailable. Please retry.',503);
   const batch=(page.data??[]) as {items:unknown;received_at:string}[];found.push(...batch);if(batch.length<500)return found;
  }
  throw new JcbError('Trip archive is too large to read safely. Choose a shorter date range.',422);
 })());}
 const rows=(await Promise.all(windows)).flat().sort((a,b)=>b.received_at.localeCompare(a.received_at));
 const routePoints=new Map<string,Map<string,JsonRecord>>();
 for(const row of rows)for(const value of Array.isArray(row.items)?row.items:[]){
  const item=record(value),itemAsset=record(item.asset),itemOwner=record(item.owner),location=record(item.location),telemetry=record(item.telemetry),io=record(item.io),battery=record(io.battery),at=date(item.date),assetId=text(itemAsset.id),latitude=number(location.lat),longitude=number(location.lon);
  if(item.type!=='telemetry'||text(itemOwner.id)!==owner||!assetId||!at||latitude===null||longitude===null||Math.abs(latitude)>90||Math.abs(longitude)>180||(latitude===0&&longitude===0))continue;
  const points=routePoints.get(assetId)??new Map<string,JsonRecord>();
  if(!points.has(at))points.set(at,{at,latitude,longitude,speed_kph:number(location.speed??telemetry.speed),ignition:telemetry.ignition===1||telemetry.ignition===true?true:telemetry.ignition===0||telemetry.ignition===false?false:null,power_voltage:number(telemetry.power_voltage),tracker_battery_voltage:number(telemetry.battery_voltage??battery.value)});
  routePoints.set(assetId,points);
 }
 const trips=new Map<string,JsonRecord>();
 for(const row of rows)for(const value of Array.isArray(row.items)?row.items:[]){
  const item=record(value),itemAsset=record(item.asset),itemOwner=record(item.owner);
  if(item.type!=='trip'||text(itemOwner.id)!==owner)continue;
  const assetId=text(itemAsset.id),assetName=assetId?(assetNames.get(assetId)??text(itemAsset.name)??assetId):null;if(!assetId||(asset&&assetId!==asset)||(search&&!assetIds.includes(assetId)&&!`${assetId} ${assetName}`.toLowerCase().includes(search)))continue;
  const endedAt=date(item.dateEnd??item.endDate),ended=endedAt?Date.parse(endedAt):NaN;
  if(!Number.isFinite(ended)||ended<start||ended>=end||ended>Date.now())continue;
  const startedAt=date(item.dateStart??item.startDate),tripStart=record(item.start),tripEnd=record(item.end),counters=record(item.counters),telemetry=record(item.telemetry),stats=record(item.stats),maxes=record(item.maxes),endCounters=record(tripEnd.counters);
  const id=text(item.id)??`${assetId}:${startedAt??''}:${endedAt}`;
  if(!trips.has(id))trips.set(id,{id,asset_id:assetId,asset_name:assetName,started_at:startedAt,ended_at:endedAt,start_latitude:number(tripStart.lat),start_longitude:number(tripStart.lon),start_address:text(tripStart.address)??text(record(tripStart.gc).rt)??text(record(tripStart.gc).rd),end_latitude:number(tripEnd.lat),end_longitude:number(tripEnd.lon),end_address:text(tripEnd.address)??text(record(tripEnd.gc).rt)??text(record(tripEnd.gc).rd),distance:number(stats.distance??counters.distance??item.distance),odometer:number(endCounters.odometer??counters.odometer??telemetry.odometer),speed_kph:number(maxes.speed??tripEnd.speed??telemetry.speed),route_points:[...(routePoints.get(assetId)?.values()??[])].filter(point=>startedAt&&String(point.at)>=startedAt&&String(point.at)<=endedAt!).sort((a,b)=>String(a.at).localeCompare(String(b.at)))});
 }
 const sorted=[...trips.values()].sort((a,b)=>String(b.ended_at).localeCompare(String(a.ended_at)));
 return {trips:sorted.slice(0,2001),archive_start:rows.at(-1)?.received_at??null,latest_saved:rows[0]?.received_at??null};
}

async function searchedTrips(db:ReturnType<typeof operationsDatabase>,owner:string,start:number,end:number,matches:TripMachine[]){
 if(!matches.length)return {trips:[],archive_start:null,latest_saved:null};
 const results=await Promise.all(matches.map(item=>db.rpc('assetcare_trip_history',{p_owner:owner,p_start:new Date(start).toISOString(),p_end:new Date(end).toISOString(),p_asset:item.id})));
 if(results.some(result=>result.error||!result.data||!Array.isArray(result.data.trips))){const fallback=await Promise.all(matches.map(item=>archivedTrips(db,owner,start,end,item.id,null)));return {trips:fallback.flatMap((result,index)=>result.trips.map(trip=>({...trip,asset_name:matches[index].name}))),archive_start:fallback.map(result=>result.archive_start).filter(Boolean).sort()[0]??null,latest_saved:fallback.map(result=>result.latest_saved).filter(Boolean).sort().at(-1)??null};}
 const trips=new Map<string,JsonRecord>();let archiveStart:string|null=null,latestSaved:string|null=null;
 for(let index=0;index<results.length;index++){
  const data=results[index].data as {trips:JsonRecord[];archive_start?:string|null;latest_saved?:string|null},match=matches[index];
  for(const trip of data.trips){const id=text(trip.id);if(id&&!trips.has(id))trips.set(id,{...trip,asset_name:match.name||text(trip.asset_name)||match.id});}
  if(data.archive_start&&(!archiveStart||data.archive_start<archiveStart))archiveStart=data.archive_start;
  if(data.latest_saved&&(!latestSaved||data.latest_saved>latestSaved))latestSaved=data.latest_saved;
 }
 return {trips:[...trips.values()].sort((a,b)=>String(b.ended_at).localeCompare(String(a.ended_at))),archive_start:archiveStart,latest_saved:latestSaved};
}

async function addSpeedingEvents(db:ReturnType<typeof operationsDatabase>,owner:string,asset:string,start:number,end:number,data:{trips?:unknown}){
 if(!Array.isArray(data.trips)||!data.trips.length)return;
 const result=await db.rpc('staff_history_events',{p_id:asset,p_owner:owner,p_start:new Date(start).toISOString(),p_end:new Date(end).toISOString()});
 if(result.error||!result.data||typeof result.data!=='object')return;
 const events=Array.isArray((result.data as {events?:unknown}).events)?(result.data as {events:unknown[]}).events:[];
 for(const rawEvent of events){
  const event=record(rawEvent),occurredAt=date(event.occurred_at),speedKph=number(event.speed_kph),limitKph=number(event.limit_kph);
  if(event.kind!=='speeding'||!occurredAt||speedKph===null||limitKph===null||speedKph<=limitKph)continue;
  const eventTime=Date.parse(occurredAt);
  const trip=data.trips.map(record).find(candidate=>{const from=Date.parse(String(candidate.started_at??'')),to=Date.parse(String(candidate.ended_at??''));return Number.isFinite(from)&&Number.isFinite(to)&&eventTime>=from&&eventTime<=to;});
  if(!trip||!Array.isArray(trip.route_points)||!trip.route_points.length)continue;
  let nearest:JsonRecord|null=null,nearestGap=Number.POSITIVE_INFINITY;
  for(const rawPoint of trip.route_points){const point=record(rawPoint),pointTime=Date.parse(String(point.at??'')),gap=Math.abs(pointTime-eventTime);if(Number.isFinite(pointTime)&&gap<nearestGap){nearest=point;nearestGap=gap;}}
  if(!nearest||nearestGap>5*60_000)continue;
  nearest.speeding=true;nearest.speed_kph=speedKph;nearest.speed_limit_kph=limitKph;nearest.speeding_event_at=occurredAt;
 }
}

async function addOpenJourney(db:ReturnType<typeof operationsDatabase>,owner:string,asset:string,start:number,end:number,data:{trips?:unknown}){
 if(!Array.isArray(data.trips)||end<Date.now()-24*60*60_000)return;
 const completed=data.trips.map(record),latestCompleted=Math.max(start,...completed.map(trip=>Date.parse(String(trip.ended_at??''))).filter(Number.isFinite));
 const scanStart=Math.max(start,latestCompleted+1000,Date.now()-24*60*60_000);
 const recent=await db.from('assetcare_trip_points_recent').select('asset_name,observed_at,latitude,longitude,speed_kph,ignition,power_voltage,tracker_battery_voltage').eq('owner_id',owner).eq('asset_id',asset).gte('observed_at',new Date(scanStart-10*60_000).toISOString()).lte('observed_at',new Date(Math.min(end,Date.now()+60_000)).toISOString()).order('observed_at',{ascending:true}).limit(10000);
 if(recent.error)return;
 const unique=new Map<string,JsonRecord>();let assetName=asset;
 for(const raw of recent.data??[]){const row=record(raw),at=date(row.observed_at),latitude=number(row.latitude),longitude=number(row.longitude);if(!at||Date.parse(at)<=latestCompleted||latitude===null||longitude===null)continue;assetName=text(row.asset_name)??assetName;if(!unique.has(at))unique.set(at,{at,latitude,longitude,speed_kph:number(row.speed_kph),ignition:typeof row.ignition==='boolean'?row.ignition:null,power_voltage:number(row.power_voltage),tracker_battery_voltage:number(row.tracker_battery_voltage)});}
 const points=[...unique.values()].sort((a,b)=>String(a.at).localeCompare(String(b.at)));if(points.length<2)return;
 const distance=points.slice(1).reduce((sum,point,index)=>sum+segmentKm(points[index],point),0);if(distance<minimumTripDistanceKm)return;
 const first=points[0],last=points.at(-1)!;data.trips.push({id:`open:${asset}:${first.at}`,asset_id:asset,asset_name:assetName,started_at:first.at,ended_at:last.at,start_latitude:first.latitude,start_longitude:first.longitude,start_address:null,end_latitude:last.latitude,end_longitude:last.longitude,end_address:null,distance,odometer:null,speed_kph:last.speed_kph,route_points:points,in_progress:true});
}

export async function GET(request:NextRequest){try{
 const q=request.nextUrl.searchParams,now=Date.now();
 const endValue=q.get('to'),startValue=q.get('from');
 const end=boundary(endValue,true,now+1);
 const start=boundary(startValue,false,now-7*86400000);
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>32*86400000||end>now+86400000)throw new JcbError('Choose a valid date range of up to 32 days.',400);
 const owner=process.env.ASSETCARE_OWNER_ID;
 if(!owner)throw new JcbError('AssetCare+ trip history is not configured.',503);
 const asset=q.get('asset')?.trim()||null;
 const search=q.get('search')?.trim().toLowerCase()||null;
 if(asset&&asset.length>200||search&&search.length>200)throw new JcbError('Invalid asset reference.',400);
 const visible=await tripMachinesForViewer(request),allowed=new Map(visible.map(machine=>[machine.id,machine])),matches=search?visible.filter(machine=>`${machine.name} ${machine.id} ${machine.group}`.toLowerCase().includes(search)).slice(0,20):[];
 if(asset&&!allowed.has(asset))throw new JcbError('This machine is not available to your access group.',403);
 const db=operationsDatabase(),result=search?null:await db.rpc('assetcare_trip_history',{p_owner:owner,p_start:new Date(start).toISOString(),p_end:new Date(end).toISOString(),p_asset:asset});
 const data=search?await searchedTrips(db,owner,start,end,matches):result&&!result.error&&result.data&&Array.isArray(result.data.trips)?result.data:await archivedTrips(db,owner,start,end,asset,search);
 if(Array.isArray(data.trips))data.trips=data.trips.filter((trip:JsonRecord)=>{
  const distance=number(trip.distance);
  return distance!==null&&distance>=minimumTripDistanceKm&&(!search||`${text(trip.asset_id)??''} ${text(trip.asset_name)??''}`.toLowerCase().includes(search));
 }).sort((a:JsonRecord,b:JsonRecord)=>String(a.started_at??a.ended_at).localeCompare(String(b.started_at??b.ended_at)));
 if(asset)await addOpenJourney(db,owner,asset,start,end,data);
 if(asset)await addSpeedingEvents(db,owner,asset,start,end,data);
 if(data.trips.length>2000)throw new JcbError('Too many trips. Choose a shorter date range.',422);
 return Response.json(data,{headers:{'Cache-Control':'private, no-store','Vary':'Authorization'}});
 }catch(error){return jcbError(error);}}
