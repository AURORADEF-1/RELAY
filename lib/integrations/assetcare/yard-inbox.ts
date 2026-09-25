import {detectTransit} from '@/lib/assets/transit';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {LinkedJcbMachine,RegistryMachine} from '../jcb/types';
import {movementEvents,validPosition,type AssetEvent} from '@/lib/assets/events';
import {normalizeAssetCare,linkAssetCare,type AssetCareSnapshot} from './normalize';
type Position=NonNullable<LinkedJcbMachine['position']>;
export type SavedAsset={asset_id:string;machine:LinkedJcbMachine;position_history?:Position[]};
export function projectYardInbox(items:unknown[],ownerId:string,saved:SavedAsset[],registry:RegistryMachine[],allowed:Set<string>,now=Date.now()){
 const previous=new Map(saved.map(a=>[a.asset_id,a]));
 const result=new Map<string,AssetCareSnapshot&{position_history:Position[];events:AssetEvent[]}>();
 const ordered=items.map(row=>normalizeAssetCare(row,ownerId,now)).filter((a):a is AssetCareSnapshot=>!!a).sort((a,b)=>a.observed_at.localeCompare(b.observed_at));
 for(const asset of ordered){
  const prior=result.get(asset.asset_id),stored=previous.get(asset.asset_id);
  const previousMachine=prior?.machine??stored?.machine;
  asset.machine.transit=detectTransit(asset.machine,previousMachine,now);
  if(previousMachine?.ignition?.value===false&&asset.machine.ignition?.value===false&&previousMachine.ignition.at===asset.machine.ignition.at)asset.machine.transit=previousMachine.transit??null;
  const history=prior?.position_history??(stored?.position_history?.length?stored.position_history:stored?.machine.position?[stored.machine.position]:[]);
  const valid=history.filter(p=>validPosition(p,now));
  const position=asset.machine.position,latest=valid.at(-1);
  const events=[...(prior?.events??[])];
  // Queue replays and older reports must not rewind the transition baseline.
  if(validPosition(position,now)&&(!latest||Date.parse(position!.at!)>Date.parse(latest.at!))){
   const machine=linkAssetCare(asset.machine,registry);
   if(machine.relay&&allowed.has(machine.relay.id))events.push(...movementEvents(machine,valid.map(p=>({captured_at:p.at!,payload:{...machine,position:p}})),now).filter(e=>e.kind==='yard_arrival'||e.kind==='yard_departure'));
   valid.push(position!);
  }
  result.set(asset.asset_id,{...asset,position_history:valid.slice(-3),events});
 }
 return [...result.values()];
}
export async function prepareYardInbox(db:SupabaseClient,items:unknown[],ownerId:string,registry:RegistryMachine[],allowed:Set<string>){
 const ids=[...new Set(items.map(row=>normalizeAssetCare(row,ownerId)?.asset_id).filter((id):id is string=>!!id))];
 const saved:SavedAsset[]=[];
 for(let i=0;i<ids.length;i+=200){const r=await db.from('assetcare_assets').select('asset_id,machine,position_history').in('asset_id',ids.slice(i,i+200));if(r.error)throw new Error('Asset yard history unavailable');saved.push(...r.data as SavedAsset[]);}
 return projectYardInbox(items,ownerId,saved,registry,allowed);
}
