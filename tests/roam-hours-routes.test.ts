import {beforeEach,describe,it,expect,vi} from 'vitest';
import {NextRequest} from 'next/server';
const mocks=vi.hoisted(()=>({authorize:vi.fn(),sync:vi.fn(),saved:vi.fn()}));
vi.mock('@/lib/fleet-operations/server',()=>({authorizeOperations:mocks.authorize}));
vi.mock('@/lib/integrations/roam/hours-server',()=>({syncRoamHours:mocks.sync,savedRoamHours:mocks.saved}));
vi.mock('@/lib/integrations/jcb/server',()=>({jcbJson:(b:unknown,status=200)=>Response.json(b,{status}),jcbError:()=>Response.json({error:'denied'},{status:403})}));
import {GET,POST} from '@/app/api/integrations/roam/hours/route';
import {GET as cron} from '@/app/api/cron/roam-hours/route';
describe('hour log access',()=>{beforeEach(()=>vi.resetAllMocks());it('denies unauthorised reads, exports and sync before reading storage',async()=>{mocks.authorize.mockRejectedValue(Error('No access'));expect((await GET(new NextRequest('https://relay.test/api?format=csv'))).status).toBe(403);expect((await POST(new NextRequest('https://relay.test/api',{method:'POST'}))).status).toBe(403);expect(mocks.saved).not.toHaveBeenCalled();expect(mocks.sync).not.toHaveBeenCalled()});it('exports saved readings only after authorisation',async()=>{mocks.saved.mockResolvedValue({items:[],last_success:null});const r=await GET(new NextRequest('https://relay.test/api?format=csv&machineId=asset'));expect(r.status).toBe(200);expect(r.headers.get('content-type')).toContain('text/csv');expect(mocks.saved).toHaveBeenCalledWith('asset')});it('cron rejects absent credentials',async()=>{expect((await cron(new NextRequest('https://relay.test/api/cron/roam-hours'))).status).toBe(401);expect(mocks.sync).not.toHaveBeenCalled()})});
