import 'server-only';
import {createHash} from 'node:crypto';
import {normalizeAssetCare,type AssetCareSnapshot} from './normalize';
const endpoint='https://export.eu1.kt1.io/v2/stream';
export type Batch={items:unknown[];id:string|null};
export class StreamError extends Error{constructor(public status:number,public retryAfter=300){super(`Asset Care+ collection unavailable (${status}).`);}}
export async function streamRequest(key:string,id?:string,fetcher:typeof fetch=fetch):Promise<Batch|null>{
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),id?10000:50000);
 try{
  const response=await fetcher(id?`${endpoint}/${encodeURIComponent(id)}`:endpoint,{method:id?'DELETE':'GET',headers:{'x-access-token':key,Accept:'application/json'},redirect:'error',cache:'no-store',signal:controller.signal});
  if(!response.ok){await response.body?.cancel();const retry=response.headers.get('Retry-After'),seconds=retry&&/^\d+$/.test(retry)?Number(retry):retry?Math.ceil((Date.parse(retry)-Date.now())/1000):300;throw new StreamError(response.status,Math.max(300,Number.isFinite(seconds)?seconds:300));}
  if(id){await response.body?.cancel();return null;}
  const reader=response.body?.getReader();if(!reader)throw new StreamError(502);
  const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>25*1024*1024)throw new StreamError(413);chunks.push(value);}}finally{await reader.cancel();}
  const data=JSON.parse(Buffer.concat(chunks).toString('utf8')) as Batch;
  if(!data||!Array.isArray(data.items)||data.items.length>10000||(data.id!==null&&typeof data.id!=='string')||(data.items.length&&!data.id))throw new StreamError(502);
  return data;
 }finally{clearTimeout(timer);controller.abort();}
}
export type CycleProgress={batches:number;records:number;drained:boolean;latestReceivedAt:string|null};
export async function collectCycle(options:{key:string;ownerId:string;save:(hash:string,items:unknown[],assets:AssetCareSnapshot[])=>Promise<void>;acknowledged:(progress:CycleProgress)=>Promise<void>;poll?:typeof streamRequest;now?:()=>number;maxBatches?:number;sleep?:(ms:number)=>Promise<void>}){
 const poll=options.poll??streamRequest,now=options.now??Date.now,deadline=now()+90000;let batches=0,records=0,latestReceivedAt:string|null=null;
 const progress=(drained=false):CycleProgress=>({batches,records,drained,latestReceivedAt});
 const pause=options.sleep??(ms=>new Promise(resolve=>setTimeout(resolve,ms)));
 const limit=Math.min(40,Math.max(1,options.maxBatches??40));
 while(batches<limit&&now()<deadline-55000){
  const batch=await poll(options.key);if(!batch||!batch.items.length)return progress(true);
  const latest=new Map<string,AssetCareSnapshot>();
  for(const row of batch.items){const item=normalizeAssetCare(row,options.ownerId,now());if(item&&(!latest.has(item.asset_id)||latest.get(item.asset_id)!.observed_at<item.observed_at))latest.set(item.asset_id,item);}
  const hash=createHash('sha256').update(JSON.stringify(batch.items)).digest('hex');
  // The whole batch (including unknown record types) must be durable before DEL.
  await options.save(hash,batch.items,[...latest.values()]);
  await poll(options.key,batch.id!);batches++;records+=batch.items.length;
  for(const item of batch.items){const received=(item as {received?:unknown})?.received;if(typeof received==='string'&&Number.isFinite(Date.parse(received))&&Date.parse(received)<=now()&&(!latestReceivedAt||Date.parse(received)>Date.parse(latestReceivedAt)))latestReceivedAt=received;}
  await options.acknowledged(progress());
  // One sequential consumer, at most 80 vendor requests per run, paced batches.
  if(batches<limit)await pause(500);
 }
 return progress();
}
