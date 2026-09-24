import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
vi.mock('next/cache',()=>({unstable_cache:(fn:unknown)=>fn}));
const mock=vi.hoisted(()=>({from:vi.fn()}));
vi.mock('@/lib/fleet-operations/server',()=>({operationsDatabase:()=>({from:mock.from})}));
import {normalizeTakeuchi,linkTakeuchiMachines,normalizeTakeuchiFault,takeuchiFleetSchema} from '@/lib/integrations/takeuchi/normalize';
import {getTakeuchiFleet,cachedTakeuchi,safeTakeuchiPath} from '@/lib/integrations/takeuchi/client';
import {projectMachine} from '@/lib/integrations/jcb/normalize';
import {machineKey,partsRequestUrl} from '@/lib/integrations/jcb/types';
const at='2026-09-24T10:00:00.000Z';
const raw={EquipmentHeader:{PIN:'12345',OEMName:'Takeuchi',EquipmentID:'TB260 12345',Model:'TB260'},Location:{Latitude:52.4,Longitude:.95,datetime:at},FuelUsed:{FuelConsumed:123,FuelUnits:'LITRE',datetime:at},FuelRemaining:{Percent:45,datetime:at},CumulativeOperatingHours:{Hour:1234,datetime:at}};
const registry=[{id:'r',machine_number:'24001',serial_number:'12345',make:'TAKEUCHI',model:'TB260'}];
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.clearAllMocks();});
describe('Takeuchi AEMP normalization',()=>{
 it('preserves real units, zero values and provider timestamps without inventing idle hours',()=>{const m=normalizeTakeuchi(raw);expect(m).toMatchObject({source:'takeuchi',position:{at},fuelUsed:{value:123,at},hours:{value:1234,at},idleHours:null});expect(normalizeTakeuchi({...raw,FuelUsed:{...raw.FuelUsed,FuelConsumed:0}}).fuelUsed?.value).toBe(0);expect(normalizeTakeuchi({...raw,FuelUsed:{...raw.FuelUsed,FuelUnits:'gallon'}}).fuelUsed).toBeNull();});
 it('links only unique exact Takeuchi serials, never model names or device labels',()=>{const m=normalizeTakeuchi(raw);expect(linkTakeuchiMachines([m],registry,[])[0].relay?.id).toBe('r');expect(linkTakeuchiMachines([m],[{...registry[0],make:'JCB'}],[])[0].relay).toBeNull();expect(linkTakeuchiMachines([m],[...registry,{...registry[0],id:'other'}],[])[0].match).toBe('ambiguous');expect(linkTakeuchiMachines([m,m],registry,[])[0].relay).toBeNull();expect(linkTakeuchiMachines([m],[{...registry[0],serial_number:'123450'}],[])[0].relay).toBeNull();});
 it('keeps fitter locations and request provider context while excluding admin readings',()=>{const m=linkTakeuchiMachines([normalizeTakeuchi(raw)],registry,[])[0];expect(partsRequestUrl(m,'E1')).toContain('telematics=takeuchi');expect(machineKey(m)).toBe('takeuchi:12345');expect(projectMachine(m,false)).not.toHaveProperty('fuelUsed');expect(projectMachine(m,false).source).toBe('takeuchi');});
 it('preserves dated fault codes without assigning absent severity',()=>{expect(normalizeTakeuchiFault({CodeIdentifier:'E123',CodeDescription:'Provider description',datetime:at})).toEqual({code:'E123',description:'Provider description',severity:'Not supplied',at});});
 it('rejects malformed equipment and foreign pagination destinations',()=>{expect(takeuchiFleetSchema.safeParse({equipment:[{}],links:[]}).success).toBe(false);expect(()=>safeTakeuchiPath('https://evil.example/Fleet/2','Fleet/')).toThrow();expect(()=>safeTakeuchiPath('https://iris.trackunit.com/another-api','Fleet/')).toThrow();});
});
describe('Takeuchi durable read cache',()=>{
 beforeEach(()=>{const chain={select:vi.fn(()=>chain),eq:vi.fn(()=>chain),maybeSingle:vi.fn(async()=>({data:{payload:[normalizeTakeuchi(raw)],checked_at:new Date().toISOString()},error:null}))};mock.from.mockReturnValue(chain);});
 it('reuses recent fleet snapshots without spending another provider request',async()=>{const f=vi.fn();vi.stubGlobal('fetch',f);const r=await getTakeuchiFleet();expect(r.machines).toHaveLength(1);expect(f).not.toHaveBeenCalled();});
 it('fails closed on storage failure before sending credentials',async()=>{mock.from.mockReturnValue({select:()=>({eq:()=>({maybeSingle:async()=>({error:{message:'failed'},data:null})})})});const load=vi.fn();await expect(cachedTakeuchi('fleet',load)).rejects.toThrow('cache');expect(load).not.toHaveBeenCalled();});
 it('does not fetch when another worker holds the provider request lease',async()=>{const chain={select:()=>chain,eq:()=>chain,lt:async()=>({select:()=>({data:[]})}),maybeSingle:async()=>({data:{payload:null,checked_at:null},error:null}),update:()=>chain};chain.lt=()=>({select:async()=>({data:[],error:null})}) as never;mock.from.mockReturnValue(chain);const load=vi.fn();await expect(cachedTakeuchi('fleet',load)).rejects.toThrow('updating');expect(load).not.toHaveBeenCalled();});
});
