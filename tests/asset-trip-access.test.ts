import {beforeEach,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
vi.mock('server-only',()=>({}));
const mocks=vi.hoisted(()=>({authorize:vi.fn(),db:vi.fn(),ownership:vi.fn()}));
vi.mock('@/lib/assets/access',()=>({authorizeAssets:mocks.authorize}));
vi.mock('@/lib/fleet-operations/server',()=>({operationsDatabase:mocks.db,ownership:mocks.ownership}));
import {GET} from '@/app/api/assets/[id]/route';
import {JcbError} from '@/lib/integrations/jcb/client';
const params={params:Promise.resolve({id:'machine'})};
beforeEach(()=>vi.clearAllMocks());
it('blocks requester trip history before opening privileged storage',async()=>{
 mocks.authorize.mockImplementation(async(_request,adminOnly)=>{if(adminOnly)throw new JcbError('Admin access required.',403);return {admin:false};});
 const response=await GET(new NextRequest('https://relay.test/api/assets/machine?view=movements&days=30'),params);
 expect(response.status).toBe(403);expect(mocks.authorize).toHaveBeenCalledWith(expect.anything(),true);expect(mocks.db).not.toHaveBeenCalled();
});
it('keeps normal asset access separate from admin-only history',async()=>{
 mocks.authorize.mockResolvedValue({admin:false});mocks.db.mockReturnValue({});mocks.ownership.mockResolvedValue({registry:[],allowed:new Set()});
 await GET(new NextRequest('https://relay.test/api/assets/machine'),params);
 expect(mocks.authorize).toHaveBeenCalledWith(expect.anything(),false);
});
it('allows an administrator to retrieve movement history',async()=>{
 mocks.authorize.mockResolvedValue({admin:true});mocks.ownership.mockResolvedValue({registry:[{id:'machine'}],allowed:new Set(['machine'])});
 const query={select:()=>query,eq:()=>query,order:()=>query,gte:()=>query,limit:async()=>({data:[],error:null}),range:async()=>({data:[],error:null})};mocks.db.mockReturnValue({from:()=>query});
 const response=await GET(new NextRequest('https://relay.test/api/assets/machine?view=movements'),params);expect(response.status).toBe(200);expect(await response.json()).toMatchObject({points:[],truncated:false});
});
