import {createHash} from 'node:crypto';
import type {LinkedJcbMachine} from '@/lib/integrations/jcb/types';
export type AssetGroup={lookup_hash:string;cost_centre:string;category:string};
export const normaliseLabel=(value:string)=>value.trim().replace(/\s+/g,' ').toUpperCase();
export function assetGroupKeys(label:string){
 const name=normaliseLabel(label),keys=[`label:${name}`];
 const fleet=/^(\d{4,6})(?:$|\s+[-–—]\s+|\s+\(HIDDEN\)$)/.exec(name)?.[1];
 const registration=/^([A-Z]{2}\d{2}\s?[A-Z]{3})(?:$|\s+[-–—]\s+)/.exec(name)?.[1];
 if(fleet)keys.push(`fleet:${fleet}`);if(registration)keys.push(`registration:${registration.replace(/\s/g,'')}`);
 return keys.map(key=>createHash('sha256').update(key).digest('hex'));
}
export function applyAssetGroups(machines:LinkedJcbMachine[],groups:AssetGroup[]){
 const byKey=new Map(groups.map(g=>[g.lookup_hash,g]));
 return machines.map(m=>{
  const keys=[...assetGroupKeys(m.equipmentId),...(m.relay?assetGroupKeys(m.relay.machine_number):[])];
  const matches=keys.flatMap(k=>byKey.has(k)?[byKey.get(k)!]:[]);
  const unique=[...new Set(matches.map(g=>`${g.cost_centre}\0${g.category}`))];
  const g=unique.length===1?matches[0]:null;
  return {...m,assetGroup:g?.cost_centre??'Ungrouped',assetCategory:g?.category??(m.source!=='assetcare'?'Plant':'Unclassified')};
 });
}
