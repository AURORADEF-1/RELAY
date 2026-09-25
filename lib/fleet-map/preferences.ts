import type {LinkedJcbMachine} from '@/lib/integrations/jcb/types';
import type {CardStatus} from '@/lib/assets/card-status';
import {machineKey,machineBrand} from '@/lib/integrations/jcb/types';
import {positionSide} from '@/lib/fleet-operations/report';
export const providers=['jcb','trackunit','takeuchi','assetcare'] as const;
export const providerNames={jcb:'JCB',trackunit:'Manitou',takeuchi:'Takeuchi',assetcare:'Asset Care+'};
export type Preferences={brand:string;category:string;group:string;providers:string[];yard:boolean;labels:boolean;cluster:boolean;base:'map'|'satellite';freshness:'all'|'fresh'|'old'|'missing';status:'all'|'fault'|'movement'|'transit'|'running'|'unknown';area:'all'|'yard'|'away'};
export const defaults:Preferences={brand:'all',category:'all',group:'all',providers:[...providers],yard:true,labels:false,cluster:true,base:'map',freshness:'all',status:'all',area:'all'};
export function readPreferences(value:string|null):Preferences{
 try{const p=JSON.parse(value??'null');if(!p||typeof p!=='object')return {...defaults};return {brand:typeof p.brand==='string'?p.brand:'all',category:typeof p.category==='string'?p.category:'all',group:typeof p.group==='string'?p.group:'all',providers:Array.isArray(p.providers)?p.providers.filter((s:unknown)=>typeof s==='string'&&providers.includes(s as typeof providers[number])):[...providers],yard:typeof p.yard==='boolean'?p.yard:true,labels:p.labels===true,cluster:p.cluster!==false,base:p.base==='satellite'?'satellite':'map',freshness:['fresh','old','missing'].includes(p.freshness)?p.freshness:'all',status:['fault','movement','transit','running','unknown'].includes(p.status)?p.status:'all',area:['yard','away'].includes(p.area)?p.area:'all'};}catch{return {...defaults};}
}
export function filterFleet(machines:LinkedJcbMachine[],prefs:Preferences,query:string,statuses:Record<string,CardStatus>,now=Date.now()){
 const q=query.trim().toLowerCase();return machines.filter(m=>{
  if(!prefs.providers.includes(m.source??'jcb')||!`${m.relay?.machine_number??''} ${m.equipmentId} ${machineBrand(m)} ${m.model} ${m.pin}`.toLowerCase().includes(q))return false;
  if(prefs.brand!=='all'&&fleetBrand(m)!==prefs.brand||prefs.category!=='all'&&(m.assetCategory??'Unclassified')!==prefs.category||prefs.group!=='all'&&(m.assetGroup??'Ungrouped')!==prefs.group)return false;
  const age=m.position?.at?now-Date.parse(m.position.at):NaN,fresh=Number.isFinite(age)&&age>=0&&age<=86400000;
  if(prefs.freshness==='missing'&&m.position||prefs.freshness==='fresh'&&!fresh||prefs.freshness==='old'&&(!m.position||fresh))return false;
  const s=statuses[machineKey(m)];
  if(prefs.status==='transit'&&!s?.transit)return false;
  if(prefs.status==='fault'&&s?.tone!=='fault'&&s?.tone!=='review'||prefs.status==='movement'&&!s?.movement||prefs.status==='running'&&s?.tone!=='running'||prefs.status==='unknown'&&s&&s.tone!=='unknown')return false;
  if(prefs.area!=='all'){const side=positionSide(m.position,now);if(side!==(prefs.area==='yard'?'off_hire':'on_hire'))return false;}
  return true;
 });
}

export function fleetBrand(m:LinkedJcbMachine){return (m.relay?.make?.trim()||(m.source==='assetcare'?'Unknown':machineBrand(m))).toUpperCase();}
