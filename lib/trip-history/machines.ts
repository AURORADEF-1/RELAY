import 'server-only';
import type {NextRequest} from 'next/server';
import {normalizeAccessGroup} from '@/lib/access-groups';
import {fleetGroups} from '@/lib/fleet-map/group-store';
import {requesterMachines} from '@/lib/fleet-map/requester';
import {operationsDatabase} from '@/lib/fleet-operations/server';
import {getAssetCareFleet} from '@/lib/integrations/assetcare/server';
import {JcbError} from '@/lib/integrations/jcb/client';
import type {LinkedJcbMachine} from '@/lib/integrations/jcb/types';
import {authorizeRelayRequesterRoute} from '@/lib/integrations/rico/route-auth';

export type TripMachine={id:string;name:string;group:string};

const MACHINE_INDEX_TTL_MS=2*60_000;
let machineIndexCache:{expiresAt:number;value:Promise<{raw:LinkedJcbMachine[];groups:Awaited<ReturnType<typeof fleetGroups>>}>}|null=null;

function machineIndex(){
 const now=Date.now();
 if(machineIndexCache&&machineIndexCache.expiresAt>now)return machineIndexCache.value;
 const value=Promise.all([getAssetCareFleet(),fleetGroups(operationsDatabase())]).then(([source,groups])=>({raw:source.machines.map(machine=>({...machine,source:'assetcare' as const})),groups}));
 machineIndexCache={expiresAt:now+MACHINE_INDEX_TTL_MS,value};
 void value.catch(()=>{if(machineIndexCache?.value===value)machineIndexCache=null;});
 return value;
}

export async function tripMachinesForViewer(request:NextRequest):Promise<TripMachine[]>{
 const auth=await authorizeRelayRequesterRoute(request);
 if(!auth.ok)throw new JcbError(auth.error,auth.status);
 const profile=await auth.supabase.from('profiles').select('role,access_group').eq('id',auth.user.id).single();
 if(profile.error||!profile.data)throw new JcbError('Unable to verify fleet access.',503);
 const allowed=['admin','assetcare','fitter','workshop','transport','office'];
 const assigned=typeof profile.data.access_group==='string'?normalizeAccessGroup(profile.data.access_group):null;
 const preview=request.headers.get('x-relay-preview-access-group');
 const requested=profile.data.role==='admin'&&preview?normalizeAccessGroup(preview):null;
 const accessGroup=requested&&allowed.includes(requested)?requested:assigned;
 if(accessGroup&&!allowed.includes(accessGroup))throw new JcbError('Fleet access is not enabled for this group.',403);
 const {raw,groups}=await machineIndex();
 if(!groups.length)throw new JcbError('Fleet groups are unavailable. Please retry.',503);
 const unrestrictedAdmin=profile.data.role==='admin'&&(!accessGroup||accessGroup==='admin');
 let machines:LinkedJcbMachine[]=unrestrictedAdmin?requesterMachines(raw,groups,{allowedPeopleGroups:'all',includeUnclassified:true}):requesterMachines(raw,groups);
 if(!unrestrictedAdmin){
  const canViewNonShared=accessGroup==='office'||accessGroup==='admin';
  machines=(accessGroup?requesterMachines(raw,groups,{allowedPeopleGroups:'all',includeUnclassified:true}):requesterMachines(raw,groups)).filter(machine=>accessGroup==='fitter'?machine.assetGroup==='Plant':canViewNonShared||machine.assetGroup!=='Non Shared');
 }
 const unique=new Map<string,TripMachine>();
 for(const machine of machines)if(!unique.has(machine.pin))unique.set(machine.pin,{id:machine.pin,name:machine.equipmentId||machine.pin,group:machine.assetGroup??'Unmatched'});
 return [...unique.values()].sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
}
