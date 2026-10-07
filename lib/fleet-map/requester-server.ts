import 'server-only';
import type {NextRequest} from 'next/server';
import {authorizeRelayRequesterRoute} from '@/lib/integrations/rico/route-auth';
import {JcbError} from '@/lib/integrations/jcb/client';
import {getLinkedFleet} from '@/lib/integrations/jcb/server';
import {getLinkedTrackunitFleet} from '@/lib/integrations/trackunit/server';
import {getLinkedTakeuchiFleet} from '@/lib/integrations/takeuchi/server';
import {getAssetCareFleet} from '@/lib/integrations/assetcare/server';
import {allRows,operationsDatabase} from '@/lib/fleet-operations/server';
import type {AssetGroup} from './groups';
import {combinedFleet} from './server';
import {requesterMachines} from './requester';
import {normalizeAccessGroup} from '@/lib/access-groups';
import {readAllRoamHires} from '@/lib/integrations/roam/hires-server';
import {mergeRoamMap} from '@/lib/integrations/roam/map';
import type {LinkedJcbMachine} from '@/lib/integrations/jcb/types';

export async function fleetForViewer(request:NextRequest,requesterView=false){
 const auth=await authorizeRelayRequesterRoute(request);
 if(!auth.ok)throw new JcbError(auth.error,auth.status);
 const profile=await auth.supabase.from('profiles').select('role,access_group').eq('id',auth.user.id).single();
 if(profile.error||!profile.data)throw new JcbError('Unable to verify fleet access.',503);
 const accessGroup=typeof profile.data.access_group==='string'?normalizeAccessGroup(profile.data.access_group):null;
 const allowed=['admin','assetcare','fitter','workshop','transport','office'];
 if(accessGroup&&!allowed.includes(accessGroup))throw new JcbError('Fleet access is not enabled for this group.',403);
 if(profile.data.role==='admin'&&!requesterView&&(!accessGroup||accessGroup==='admin')){const fleet=await combinedFleet(request);return {...fleet,accessGroup:'admin' as const,canRenameOrAssignCostCentre:true,canViewReports:true,canViewNonShared:true};}
 // Privileged reads stay inside this authenticated, read-only projection.
 // Never reuse this context for a detail, management or mutation endpoint.
 const db=operationsDatabase(),context={...auth,supabase:db,admin:false};
 const groups=await allRows<AssetGroup>(db,'fleet_asset_groups','lookup_hash,cost_centre,category','lookup_hash');
 if(!groups.length)throw new JcbError('Fleet groups are unavailable. Please retry.',503);
 const providers=[
  {provider:'jcb' as const,enabled:process.env.JCB_LIVELINK_ENABLED,load:()=>getLinkedFleet(context)},
  {provider:'trackunit' as const,enabled:process.env.TRACKUNIT_ENABLED,load:()=>getLinkedTrackunitFleet(context)},
  {provider:'takeuchi' as const,enabled:process.env.TAKEUCHI_ENABLED,load:()=>getLinkedTakeuchiFleet(context)},
  {provider:'assetcare' as const,enabled:process.env.ASSETCARE_ENABLED,load:()=>getAssetCareFleet()},
 ];
 const results=await Promise.allSettled(providers.map(p=>p.enabled==='true'?p.load():Promise.reject(new Error('Disabled'))));
 let raw:LinkedJcbMachine[]=results.flatMap((r,i)=>r.status==='fulfilled'?r.value.machines.map(m=>({...m,source:providers[i].provider})):[]);
 let roam:{available:boolean;count:number;checkedAt:string|null;stale:boolean}={available:false,count:0,checkedAt:null,stale:true};
 try{const current=await readAllRoamHires();raw=mergeRoamMap(raw,current.items);roam={available:true,count:current.items.filter(h=>h.status==='on_site').length,checkedAt:current.generatedAt,stale:false};}catch{}
 const canViewNonShared=accessGroup==='office';
 const machines=accessGroup
  ? requesterMachines(raw,groups,{allowedPeopleGroups:canViewNonShared?['Non Shared']:[]}).filter(machine=>canViewNonShared||machine.assetGroup!=='Non Shared')
  : requesterMachines(raw,groups);
 return {machines,admin:false,accessGroup,canRenameOrAssignCostCentre:accessGroup!==null&&['transport','office','workshop'].includes(accessGroup),canViewReports:accessGroup!==null&&['transport','office','workshop'].includes(accessGroup),canViewNonShared,groupError:false,assetcareStatus:null,sources:[...results.map((r,i)=>({provider:providers[i].provider,available:r.status==='fulfilled',count:machines.filter(m=>m.source===providers[i].provider).length,checkedAt:r.status==='fulfilled'?r.value.checkedAt:null,stale:r.status==='fulfilled'?r.value.stale:true})),{provider:'roam' as const,...roam,count:machines.filter(m=>m.roamHire).length}]};
}
