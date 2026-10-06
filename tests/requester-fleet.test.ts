import {beforeEach,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {requesterMachines} from '@/lib/fleet-map/requester';
import {assetGroupKeys} from '@/lib/fleet-map/groups';
import type {LinkedJcbMachine} from '@/lib/integrations/jcb/types';
vi.mock('server-only',()=>({}));
const mocks=vi.hoisted(()=>({auth:vi.fn(),profile:vi.fn(),rows:vi.fn(),db:vi.fn(),admin:vi.fn(),jcb:vi.fn(),trackunit:vi.fn(),takeuchi:vi.fn(),assetcare:vi.fn()}));
vi.mock('@/lib/integrations/rico/route-auth',()=>({authorizeRelayRequesterRoute:mocks.auth}));
vi.mock('@/lib/fleet-operations/server',()=>({allRows:mocks.rows,operationsDatabase:mocks.db}));
vi.mock('@/lib/fleet-map/server',()=>({combinedFleet:mocks.admin}));
vi.mock('@/lib/integrations/jcb/server',()=>({getLinkedFleet:mocks.jcb}));
vi.mock('@/lib/integrations/trackunit/server',()=>({getLinkedTrackunitFleet:mocks.trackunit}));
vi.mock('@/lib/integrations/takeuchi/server',()=>({getLinkedTakeuchiFleet:mocks.takeuchi}));
vi.mock('@/lib/integrations/assetcare/server',()=>({getAssetCareFleet:mocks.assetcare}));
import {fleetForViewer} from '@/lib/fleet-map/requester-server';
const machine=(pin:string,source:LinkedJcbMachine['source']='assetcare'):LinkedJcbMachine=>({source,pin,equipmentId:pin,model:'Asset',position:{latitude:52,longitude:1,at:'2026-09-25T10:00:00Z'},relay:null,match:'unmatched',hours:{value:123,at:null}});
const group=(name:string,category:string)=>({lookup_hash:assetGroupKeys(name)[0],cost_centre:category,category});
const request=new NextRequest('https://relay.test/api/integrations/combined/fleet');
beforeEach(()=>{
 vi.resetAllMocks();
 const chain={select:()=>chain,eq:()=>chain,single:mocks.profile};
 mocks.auth.mockResolvedValue({ok:true,user:{id:'requester'},supabase:{from:()=>chain}});
 mocks.profile.mockResolvedValue({data:{role:'requester'},error:null});
 mocks.rows.mockResolvedValue([group('person','People'),group('vehicle','Vehicles')]);
 for(const p of ['JCB_LIVELINK','TRACKUNIT','TAKEUCHI','ASSETCARE'])vi.stubEnv(`${p}_ENABLED`,'true');
 for(const p of ['jcb','trackunit','takeuchi','assetcare'] as const)mocks[p].mockResolvedValue({machines:[machine(p==='assetcare'?'vehicle':p,p)],checkedAt:'2026-09-28T10:00:00Z',stale:false});
});
it('removes People, conflicting People aliases and unclassified Asset Care records before deduplication',()=>{
 const relay={id:'same',machine_number:'12345',make:'JCB',model:'X',serial_number:null};
 const rows=[{...machine('person'),relay},{...machine('manufacturer','jcb'),relay},machine('vehicle'),machine('unclassified')];
 const safe=requesterMachines(rows,[group('person','People'),group('12345','Plant'),group('vehicle','Vehicles')]);
 expect(safe.map(m=>m.pin)).toEqual(['vehicle']);
 expect(safe[0]).not.toHaveProperty('hours');
 expect(safe[0].position).toEqual(rows[2].position);
});
it('allows only the explicitly authorised People group for office viewers',()=>{
 const groups=[{lookup_hash:assetGroupKeys('private')[0],cost_centre:'Non Shared',category:'People'},{lookup_hash:assetGroupKeys('operator')[0],cost_centre:'Operators',category:'People'}];
 const safe=requesterMachines([machine('private'),machine('operator')],groups,{allowedPeopleGroups:['Non Shared']});
 expect(safe.map(m=>[m.pin,m.assetGroup])).toEqual([['private','Non Shared']]);
});
it.each([401,403])('rejects denied authentication %s before privileged reads',async status=>{
 mocks.auth.mockResolvedValue({ok:false,status,error:'Denied'});
 await expect(fleetForViewer(request)).rejects.toMatchObject({status});expect(mocks.db).not.toHaveBeenCalled();
});
it('fails closed when groups cannot be verified',async()=>{
 mocks.rows.mockRejectedValue(new Error('Storage unavailable'));
 await expect(fleetForViewer(request)).rejects.toThrow();expect(mocks.jcb).not.toHaveBeenCalled();
});
it('rejects an empty group registry',async()=>{
 mocks.rows.mockResolvedValue([]);await expect(fleetForViewer(request)).rejects.toMatchObject({status:503});
});
it('provides all four feeds without fitter grants and strips People counts and collector details',async()=>{
 mocks.assetcare.mockResolvedValue({machines:[machine('person'),machine('vehicle')],checkedAt:'now',stale:false,status:{last_error:'private'}});
 const result=await fleetForViewer(request);expect(result.admin).toBe(false);
 expect(result.machines.map(m=>m.source)).toEqual(['jcb','trackunit','takeuchi','assetcare']);
 expect(result.sources.find(s=>s.provider==='assetcare')?.count).toBe(1);
 expect(JSON.stringify(result)).not.toContain('person');expect(result.assetcareStatus).toBeNull();
});
it('shows surviving sources on a provider outage',async()=>{
 mocks.trackunit.mockRejectedValue(new Error('private provider failure'));const result=await fleetForViewer(request);
 expect(result.sources[1]).toMatchObject({available:false,count:0,stale:true});expect(result.machines).toHaveLength(3);
});
it('retains the existing admin path',async()=>{
 mocks.profile.mockResolvedValue({data:{role:'admin'},error:null});mocks.admin.mockResolvedValue({admin:true});
 expect(await fleetForViewer(request)).toEqual({admin:true,accessGroup:'admin',canRenameOrAssignCostCentre:true,canViewReports:true,canViewNonShared:true});expect(mocks.db).not.toHaveBeenCalled();
});

it('keeps the forced requester projection even for an admin caller',async()=>{mocks.profile.mockResolvedValue({data:{role:'admin'},error:null});const r=await fleetForViewer(request,true);expect(r.admin).toBe(false);expect(mocks.admin).not.toHaveBeenCalled();});
