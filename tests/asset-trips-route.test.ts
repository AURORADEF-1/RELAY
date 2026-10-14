import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
vi.mock('server-only',()=>({}));
const mocks=vi.hoisted(()=>({authorize:vi.fn(),db:vi.fn()}));
vi.mock('@/lib/assets/access',()=>({authorizeAssets:mocks.authorize}));
vi.mock('@/lib/fleet-operations/server',()=>({operationsDatabase:mocks.db}));
import {GET} from '@/app/api/assets/trips/route';

const previousOwner=process.env.ASSETCARE_OWNER_ID;
beforeEach(()=>{vi.clearAllMocks();process.env.ASSETCARE_OWNER_ID='owner-1';mocks.authorize.mockResolvedValue({admin:true});});
afterEach(()=>{vi.useRealTimers();if(previousOwner===undefined)delete process.env.ASSETCARE_OWNER_ID;else process.env.ASSETCARE_OWNER_ID=previousOwner;});

it('rebuilds trip history from archived batches when the database projection is unavailable',async()=>{
 vi.useFakeTimers();vi.setSystemTime('2026-10-14T12:00:00.000Z');const lt=vi.fn();
 const batches={gte:()=>batches,lt:(...args:[string,string])=>{lt(...args);return batches;},order:()=>batches,range:vi.fn().mockResolvedValue({data:[{received_at:'2026-10-14T09:00:00.000Z',items:[{id:'trip-1',type:'trip',owner:{id:'owner-1'},asset:{id:'asset-1',name:'Provider label'},dateStart:'2026-10-13T08:00:00.000Z',dateEnd:'2026-10-13T08:30:00.000Z',start:{lat:'51.1',lon:'-1.1',gc:{rt:'Yard'}},end:{lat:51.2,lon:-1.2,gc:{rd:'Site'}},counters:{distance:'12.5'}}]}],error:null})};
 const assets={limit:vi.fn().mockResolvedValue({data:[{asset_id:'asset-1',name:'Machine 1'}],error:null})};
 mocks.db.mockReturnValue({rpc:vi.fn().mockResolvedValue({data:null,error:{message:'function unavailable'}}),from:vi.fn((table:string)=>({select:()=>table==='assetcare_assets'?assets:batches}))});
 const response=await GET(new NextRequest('https://relay.test/api/assets/trips?from=2026-10-13T00:00:00.000Z&to=2026-10-14T00:00:00.000Z&search=Machine%201'));
 expect(response.status).toBe(200);
 expect(await response.json()).toMatchObject({trips:[{id:'trip-1',asset_id:'asset-1',asset_name:'Machine 1',start_address:'Yard',end_address:'Site',distance:12.5}]});
 expect(lt).toHaveBeenCalledWith('received_at','2026-10-14T12:00:01.000Z');
});

it('filters projected trips by machine before enforcing the result limit',async()=>{
 const unrelated=Array.from({length:2001},(_,index)=>({id:`other-${index}`,asset_id:`other-${index}`,asset_name:'Other machine'}));
 mocks.db.mockReturnValue({rpc:vi.fn().mockResolvedValue({data:{trips:[...unrelated,{id:'wanted',asset_id:'asset-24102',asset_name:'24102'}],archive_start:null,latest_saved:null},error:null})});
 const response=await GET(new NextRequest('https://relay.test/api/assets/trips?from=2026-10-14T00:00:00.000Z&to=2026-10-15T00:00:00.000Z&search=24102'));
 expect(response.status).toBe(200);
 expect(await response.json()).toMatchObject({trips:[{id:'wanted',asset_id:'asset-24102',asset_name:'24102'}]});
});
