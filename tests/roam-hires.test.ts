import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
import fixture from './fixtures/roam-current-hires.json';
vi.mock('server-only',()=>({}));
const access=vi.hoisted(()=>({check:vi.fn()}));
vi.mock('@/lib/fleet-operations/server',()=>({authorizeOperations:access.check}));
import {readAllRoamHires,readRoamHires,readRoamHire,readRoamPhoto} from '@/lib/integrations/roam/hires-server';
import {GET as list} from '@/app/api/integrations/roam/hires/route';
import {GET as detail} from '@/app/api/integrations/roam/hires/[id]/route';
import {GET as photo} from '@/app/api/integrations/roam/hires/[id]/photos/[photoId]/route';
import {JcbError} from '@/lib/integrations/jcb/client';
const fetcher=vi.fn();beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('ROAM_RELAY_HIRES_TOKEN','test-secret');vi.stubGlobal('fetch',fetcher);access.check.mockResolvedValue({});fetcher.mockResolvedValue(new Response(JSON.stringify(fixture)))});afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals()});
describe('ROAM current hire client',()=>{
 it('uses only the canonical ROAM endpoint and server-side token',async()=>{const result=await readRoamHires();expect(result.items[0].status).toBe('on_site');expect(fetcher).toHaveBeenCalledWith('https://roam-henna.vercel.app/api/partners/relay/hires?limit=50',expect.objectContaining({headers:{Authorization:'Bearer test-secret',Accept:'application/json'},cache:'no-store',redirect:'error'}));expect(JSON.stringify(result)).not.toContain('test-secret')});
 it('fails closed when disabled, response is incomplete or hire is closed',async()=>{vi.stubEnv('ROAM_RELAY_HIRES_TOKEN','');await expect(readRoamHires()).rejects.toMatchObject({status:503});expect(fetcher).not.toHaveBeenCalled();vi.stubEnv('ROAM_RELAY_HIRES_TOKEN','key');fetcher.mockResolvedValue(new Response(JSON.stringify({...fixture,items:[{...fixture.items[0],status:'collected'}]})));await expect(readRoamHires()).rejects.toMatchObject({status:503});fetcher.mockResolvedValue(new Response('{}',{status:404}));await expect(readRoamHire('closed')).rejects.toMatchObject({status:404})});
 it('does not expose upstream errors, secrets or accept arbitrary query paths',async()=>{fetcher.mockResolvedValue(new Response('private upstream error',{status:401}));await expect(readRoamHires()).rejects.toThrow('ROAM hire connection is unavailable');expect(()=>readRoamHires('../api/state')).toThrow('Invalid hire page');fetcher.mockResolvedValue(new Response(JSON.stringify({schema_version:1,photo_id:'p',url:'http://untrusted.test/file',expires_at:'now'})));await expect(readRoamPhoto('h','p')).rejects.toMatchObject({status:503})});
 it('reads every current-hire page without exposing the server token',async()=>{fetcher.mockResolvedValueOnce(new Response(JSON.stringify({...fixture,next_cursor:'page-2'}))).mockResolvedValueOnce(new Response(JSON.stringify({...fixture,generated_at:'2026-09-30T12:08:00Z',items:[{...fixture.items[0],id:'H-2',hire_reference:'H-2'}],next_cursor:null})));const result=await readAllRoamHires();expect(result.items.map(h=>h.id)).toEqual(['H-EXAMPLE-001','H-2']);expect(fetcher).toHaveBeenLastCalledWith(expect.stringContaining('cursor=page-2'),expect.anything());expect(JSON.stringify(result)).not.toContain('test-secret')});
});
describe('ROAM RELAY admin routes',()=>{
 const req=()=>new NextRequest('https://relay.test/api/integrations/roam/hires');
 it('authorizes all list/detail/photo requests before reading ROAM',async()=>{for(const status of [401,403]){access.check.mockRejectedValue(new JcbError('Denied',status));expect((await list(req())).status).toBe(status);expect((await detail(req(),{params:Promise.resolve({id:'h'})})).status).toBe(status);expect((await photo(req(),{params:Promise.resolve({id:'h',photoId:'p'})})).status).toBe(status)}expect(fetcher).not.toHaveBeenCalled()});
 it('returns authenticated details and photo links with no-store headers',async()=>{let r=await list(req());expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toContain('no-store');fetcher.mockResolvedValue(new Response(JSON.stringify({schema_version:1,scope:'current',item:fixture.items[0]})));r=await detail(req(),{params:Promise.resolve({id:'H-EXAMPLE-001'})});expect(r.status).toBe(200);fetcher.mockResolvedValue(new Response(JSON.stringify({schema_version:1,photo_id:'p',url:'https://storage.example.test/signed',expires_at:'2026-09-30T15:00:00Z'})));r=await photo(req(),{params:Promise.resolve({id:'h',photoId:'p'})});expect(r.status).toBe(200);expect((await r.json()).photo_id).toBe('p')});
});
