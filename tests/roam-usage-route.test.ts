import {beforeEach,describe,it,expect,vi} from 'vitest';
import {NextRequest} from 'next/server';
const mocks=vi.hoisted(()=>({authorize:vi.fn(),read:vi.fn(),usage:vi.fn()}));
vi.mock('@/lib/fleet-operations/server',()=>({authorizeOperations:mocks.authorize}));
vi.mock('@/lib/integrations/roam/hires-server',()=>({readRoamHires:mocks.read}));
vi.mock('@/lib/integrations/roam/usage-server',()=>({hireUsage:mocks.usage}));
vi.mock('@/lib/integrations/jcb/server',()=>({jcbJson:(b:unknown)=>Response.json(b),jcbError:()=>Response.json({error:'denied'},{status:403})}));
import {GET} from '@/app/api/integrations/roam/hires/[id]/usage/route';
const request=()=>new NextRequest('https://relay.test/api?fleet=EXAMPLE-2');
const context=()=>({params:Promise.resolve({id:'hire-1'})});
describe('hire usage access and asset identity',()=>{
 beforeEach(()=>vi.resetAllMocks());
 it('denies access before reading hire or telematics data',async()=>{mocks.authorize.mockRejectedValue(Error('Denied'));expect((await GET(request(),context())).status).toBe(403);expect(mocks.read).not.toHaveBeenCalled();expect(mocks.usage).not.toHaveBeenCalled()});
 it('selects the exact asset line when one contract has multiple machines',async()=>{const target={id:'hire-1',machine:{fleet:'EXAMPLE-2'}};mocks.read.mockResolvedValue({items:[{id:'hire-1',machine:{fleet:'EXAMPLE-1'}},target],next_cursor:null});mocks.usage.mockResolvedValue({hours:2});expect((await GET(request(),context())).status).toBe(200);expect(mocks.usage).toHaveBeenCalledWith(target)});
 it('does not substitute another asset when the requested line is absent',async()=>{mocks.read.mockResolvedValue({items:[{id:'hire-1',machine:{fleet:'EXAMPLE-1'}}],next_cursor:null});expect((await GET(request(),context())).status).toBe(403);expect(mocks.usage).not.toHaveBeenCalled()});
});
