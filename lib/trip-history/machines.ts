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
 const source=await getAssetCareFleet(),raw=source.machines.map(machine=>({...machine,source:'assetcare' as const}));
 let machines:LinkedJcbMachine[]=raw;
 if(!(profile.data.role==='admin'&&(!accessGroup||accessGroup==='admin'))){
  const groups=await fleetGroups(operationsDatabase());
  if(!groups.length)throw new JcbError('Fleet groups are unavailable. Please retry.',503);
  const canViewNonShared=accessGroup==='office'||accessGroup==='admin';
  machines=(accessGroup?requesterMachines(raw,groups,{allowedPeopleGroups:'all',includeUnclassified:true}):requesterMachines(raw,groups)).filter(machine=>accessGroup==='fitter'?machine.assetGroup==='Plant':canViewNonShared||machine.assetGroup!=='Non Shared');
 }
 const unique=new Map<string,TripMachine>();
 for(const machine of machines)if(!unique.has(machine.pin))unique.set(machine.pin,{id:machine.pin,name:machine.equipmentId||machine.pin,group:machine.assetGroup??'Unmatched'});
 return [...unique.values()].sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
}
