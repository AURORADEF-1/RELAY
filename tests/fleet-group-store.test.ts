import {expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const rows=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/fleet-operations/server',()=>({allRows:rows,operationsDatabase:vi.fn()}));
vi.mock('@/data/fleet-cost-centres.json',()=>({default:{protected:'Non Shared',imported:'Workshop'}}));
vi.mock('@/data/fleet-cost-centre-overrides.json',()=>({default:{override:'Plant'}}));
import {fleetGroups} from '@/lib/fleet-map/group-store';

it('uses the same imported and override mappings ahead of database labels for every fleet viewer',async()=>{
 rows.mockResolvedValue([
  {lookup_hash:'protected',cost_centre:'Managers',category:'People'},
  {lookup_hash:'database',cost_centre:'Transport',category:'Vehicles'},
  {lookup_hash:'override',cost_centre:'Workshop',category:'People'},
 ]);
 const groups=await fleetGroups({} as never),byKey=Object.fromEntries(groups.map(group=>[group.lookup_hash,group.cost_centre]));
 expect(byKey).toEqual({protected:'Non Shared',database:'Transport',override:'Plant',imported:'Workshop'});
});
