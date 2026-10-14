import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
vi.mock('server-only',()=>({}));
const mocks=vi.hoisted(()=>({authorize:vi.fn(),db:vi.fn()}));
vi.mock('@/lib/assets/access',()=>({authorizeAssets:mocks.authorize}));
vi.mock('@/lib/fleet-operations/server',()=>({operationsDatabase:mocks.db}));
import {GET} from '@/app/api/assets/trips/route';

const previousOwner=process.env.ASSETCARE_OWNER_ID;
beforeEach(()=>{vi.clearAllMocks();process.env.ASSETCARE_OWNER_ID='owner-1';mocks.authorize.mockResolvedValue({admin:true});});
afterEach(()=>{if(previousOwner===undefined)delete process.env.ASSETCARE_OWNER_ID;else process.env.ASSETCARE_OWNER_ID=previousOwner;});

it('rebuilds trip history from archived batches when the database projection is unavailable',async()=>{
 const query={gte:()=>query,order:()=>query,range:vi.fn().mockResolvedValue({data:[{received_at:'2026-10-14T09:00:00.000Z',items:[{id:'trip-1',type:'trip',owner:{id:'owner-1'},asset:{id:'asset-1',name:'Machine 1'},dateStart:'2026-10-14T08:00:00.000Z',dateEnd:'2026-10-14T08:30:00.000Z',start:{lat:'51.1',lon:'-1.1',gc:{rt:'Yard'}},end:{lat:51.2,lon:-1.2,gc:{rd:'Site'}},counters:{distance:'12.5'}}]}],error:null})};
 mocks.db.mockReturnValue({rpc:vi.fn().mockResolvedValue({data:null,error:{message:'function unavailable'}}),from:vi.fn().mockReturnValue({select:()=>query})});
 const response=await GET(new NextRequest('https://relay.test/api/assets/trips?from=2026-10-14T00:00:00.000Z&to=2026-10-15T00:00:00.000Z'));
 expect(response.status).toBe(200);
 expect(await response.json()).toMatchObject({trips:[{id:'trip-1',asset_id:'asset-1',asset_name:'Machine 1',start_address:'Yard',end_address:'Site',distance:12.5}]});
});
