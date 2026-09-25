import {beforeEach,it,expect,vi} from 'vitest';
import {NextRequest} from 'next/server';
vi.mock('server-only',()=>({}));
const mocks=vi.hoisted(()=>({authorize:vi.fn(),db:vi.fn(),ownership:vi.fn()}));
vi.mock('@/lib/assets/access',()=>({authorizeAssets:mocks.authorize}));
vi.mock('@/lib/fleet-operations/server',()=>({operationsDatabase:mocks.db,ownership:mocks.ownership}));
import {GET} from '@/app/api/assets/status/route';
import {JcbError} from '@/lib/integrations/jcb/client';
const request=new NextRequest('https://relay.test/api/assets/status');
beforeEach(()=>vi.clearAllMocks());
it('rejects unauthorized users before reading server-side fleet data',async()=>{mocks.authorize.mockRejectedValue(new JcbError('Denied',403));expect((await GET(request)).status).toBe(403);expect(mocks.db).not.toHaveBeenCalled();});
it('returns only owned asset summaries and never cached provider payloads',async()=>{
 const now=new Date().toISOString(),future=new Date(Date.now()+900000).toISOString();
 const m={source:'jcb',pin:'PIN',position:{latitude:52,longitude:1,at:now},engine:{value:true,at:now}};
 const records={fleet_operations_latest:[{machine_id:'owned',payload:m},{machine_id:'customer',payload:{...m,pin:'PRIVATE'}}],fleet_api_cache:[{provider:'jcb',cache_key:'faults:PIN',payload:{faults:[],privateField:'do not expose'},checked_at:now,lease_until:future}],takeuchi_api_cache:[],asset_inbox_current_events:[]};
 const chain=(data:unknown)=>{const q={select:()=>q,or:()=>q,like:()=>q,in:()=>q,gte:()=>q,order:()=>q,limit:()=>q,returns:()=>q,then:(resolve:(x:unknown)=>unknown)=>Promise.resolve({data,error:null}).then(resolve)};return q;};
 mocks.authorize.mockResolvedValue({});mocks.ownership.mockResolvedValue({allowed:new Set(['owned'])});mocks.db.mockReturnValue({rpc:(key:keyof typeof records)=>chain(records[key]),from:(key:keyof typeof records)=>chain(records[key])});
 const response=await GET(request),body=await response.json();expect(response.status).toBe(200);expect(Object.keys(body.statuses)).toEqual(['jcb:PIN']);expect(body.statuses['jcb:PIN'].tone).toBe('running');expect(JSON.stringify(body)).not.toContain('privateField');expect(JSON.stringify(body)).not.toContain('PRIVATE');
});
