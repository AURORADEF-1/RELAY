import {beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const mocks=vi.hoisted(()=>({auth:vi.fn(),profile:vi.fn()}));
vi.mock('@/lib/integrations/rico/route-auth',()=>({authorizeRelayRequesterRoute:mocks.auth}));
import {NextRequest} from 'next/server';
import {handleInspHireTest} from '@/lib/integrations/insphire-test/route';
import {healthSchema,requestInspHireTest} from '@/lib/integrations/insphire-test/client';
const payload={ok:true,database:'iHTEST_MLP',environment:'test',readOnly:true,checkedAt:'2026-10-09T12:00:00Z',dataFreshness:'Historical test copy',data:{connected:true,permissionsVerified:true}};
const req=(q='')=>new NextRequest('https://relay.example/api/integrations/insphire-test/health'+q);
beforeEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();vi.stubEnv('INSPHIRE_TEST_ENABLED','true');vi.stubEnv('INSPHIRE_TEST_API_URL','https://connector.example');vi.stubEnv('INSPHIRE_TEST_API_TOKEN','a'.repeat(64));vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json(payload)));mocks.profile.mockResolvedValue({data:{role:'admin'},error:null});const chain={select:()=>chain,eq:()=>chain,maybeSingle:mocks.profile};mocks.auth.mockResolvedValue({ok:true,user:{id:'test'},supabase:{from:()=>chain}});});
describe('InspHire test boundary',()=>{
 it.each([undefined,'false'])('does not contact auth or upstream while disabled (%s)',async value=>{vi.stubEnv('INSPHIRE_TEST_ENABLED',value);expect((await handleInspHireTest(req(),'health')).status).toBe(503);expect(mocks.auth).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();});
 it('accepts only the pinned read-only test database',async()=>{vi.mocked(fetch).mockResolvedValue(Response.json({...payload,database:'iHDATA_MLP'}));await expect(requestInspHireTest('health',healthSchema)).rejects.toThrow('unexpected database');});
 it('rejects insecure gateway configuration before networking',async()=>{vi.stubEnv('INSPHIRE_TEST_API_URL','http://192.168.156.9:8766');await expect(requestInspHireTest('health',healthSchema)).rejects.toThrow('secure gateway');expect(fetch).not.toHaveBeenCalled();});
 it('uses no-store, forbids redirects and keeps the connector token server-side',async()=>{const response=await handleInspHireTest(req(),'health');expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');expect(fetch).toHaveBeenCalledWith(expect.any(URL),expect.objectContaining({redirect:'error',cache:'no-store',method:'GET'}));expect(await response.text()).not.toContain('a'.repeat(64));});
 it('blocks unauthenticated and non-admin diagnostic calls',async()=>{mocks.auth.mockResolvedValueOnce({ok:false,status:401,error:'Authentication required'});expect((await handleInspHireTest(req(),'health')).status).toBe(401);mocks.profile.mockResolvedValueOnce({data:{role:'requester'},error:null});expect((await handleInspHireTest(req(),'health')).status).toBe(403);expect(fetch).not.toHaveBeenCalled();});
 it.each(['?database=iHDATA_MLP','?limit=51','?jobNumber=x&jobNumber=y','?jobNumber=%27%3BDELETE'])('rejects unsafe parameters %s',async query=>{expect((await handleInspHireTest(req(query),'workshop-jobs')).status).toBe(400);expect(fetch).not.toHaveBeenCalled();});
 it('redacts upstream errors',async()=>{vi.mocked(fetch).mockRejectedValue(new Error('SQL password=secret'));const response=await handleInspHireTest(req(),'health');expect(response.status).toBe(503);expect(await response.text()).not.toContain('secret');});
});
