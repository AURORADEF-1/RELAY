import {afterEach,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const mocks=vi.hoisted(()=>({fresh:vi.fn(),cached:vi.fn(),upsert:vi.fn().mockResolvedValue({error:null}),insert:vi.fn().mockResolvedValue({error:null})}));
vi.mock('@/lib/integrations/jcb/client',()=>({fetchJcbFleet:mocks.fresh,getJcbFleet:mocks.cached,JcbError:class extends Error{}}));
vi.mock('@/lib/fleet-operations/server',()=>({
 operationsDatabase:()=>({from:()=>({select:()=>({eq:()=>({order:()=>({limit:()=>({maybeSingle:async()=>({data:null,error:null})})})})}),upsert:mocks.upsert,insert:mocks.insert})}),
 ownership:async()=>({registry:[{id:'machine',machine_number:'24001',serial_number:'PIN1',make:'JCB',model:'3CX'}],allowed:new Set(['machine'])}),
 allRows:async()=>[],eligibleMachines:(m:unknown[])=>m,
}));
import {collectOperations} from '@/lib/fleet-operations/collect';
afterEach(()=>vi.unstubAllEnvs());
it('collects a fresh provider snapshot instead of the dashboard stale-while-revalidate cache',async()=>{
 vi.stubEnv('JCB_LIVELINK_ENABLED','true');
 mocks.fresh.mockResolvedValue({checkedAt:'2026-09-24T15:45:00Z',machines:[{pin:'PIN1',equipmentId:'24001',model:'3CX',position:{latitude:52.4,longitude:.95,at:'2026-09-24T15:44:00Z'},fuelUsed:{value:120,at:'2026-09-24T15:44:00Z'},hours:null,idleHours:null,fuel:null,adblue:null,engine:null}]});
 const result=await collectOperations('jcb');
 expect(mocks.fresh).toHaveBeenCalledOnce();expect(mocks.cached).not.toHaveBeenCalled();expect(result).toMatchObject({checked:1,total:1,failures:0});
 expect(mocks.upsert.mock.calls[0][0].payload.position.at).toBe('2026-09-24T15:44:00Z');
});
