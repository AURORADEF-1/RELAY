import {afterEach,beforeEach,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const db=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn()}));
vi.mock('@supabase/supabase-js',()=>({createClient:()=>db}));
import {cachedProvider,guardedFetch,retryUntil} from '@/lib/integrations/request-guard';
beforeEach(()=>{vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://example.supabase.co');vi.stubEnv('JCB_HEALTH_DATABASE_KEY','test');});
afterEach(()=>{vi.unstubAllEnvs();vi.resetAllMocks();});
it('honours seconds and HTTP-date Retry-After, with a 15-minute minimum',()=>{
 const now=Date.parse('2026-09-24T10:00:00Z');
 expect(retryUntil('3600',now)).toBe('2026-09-24T11:00:00.000Z');
 expect(retryUntil('Thu, 24 Sep 2026 12:00:00 GMT',now)).toBe('2026-09-24T12:00:00.000Z');
 for(const v of [null,'garbage','0','-1'])expect(retryUntil(v,now)).toBe('2026-09-24T10:15:00.000Z');
});
it('never sends a network request if the shared budget or its storage is unavailable',async()=>{
 const load=vi.fn();
 for(const result of [{data:false},{error:{message:'storage'}}]){db.rpc.mockResolvedValue(result);await expect(guardedFetch('jcb',load)).rejects.toThrow('cooling');}
 expect(load).not.toHaveBeenCalled();
});
it('records provider-wide cooldown on 429 and does not retry',async()=>{
 db.rpc.mockResolvedValueOnce({data:true}).mockResolvedValueOnce({error:null});
 const load=vi.fn(async()=>new Response('',{status:429,headers:{'Retry-After':'3600'}}));
 await expect(guardedFetch('takeuchi',load)).rejects.toThrow('pause');expect(load).toHaveBeenCalledOnce();
 expect(db.rpc.mock.calls[1][0]).toBe('cooldown_fleet_api');expect(db.rpc.mock.calls[1][1].p_provider).toBe('takeuchi');
 expect(Date.parse(db.rpc.mock.calls[1][1].p_until)-Date.now()).toBeGreaterThan(3590000);
});
it('returns cached timestamps unchanged without a provider request or cache write',async()=>{
 db.rpc.mockResolvedValue({data:{state:'cached',data:{reading:2},checkedAt:'2026-09-24T10:00:00Z'}});
 const load=vi.fn();expect(await cachedProvider('trackunit','telemetry:1',load)).toEqual({data:{reading:2},checkedAt:'2026-09-24T10:00:00Z'});expect(load).not.toHaveBeenCalled();expect(db.from).not.toHaveBeenCalled();
});
it('blocks another worker and leaves failed loaders leased rather than immediately retrying',async()=>{
 const load=vi.fn().mockRejectedValue(new Error('upstream'));
 db.rpc.mockResolvedValueOnce({data:{state:'load'}}).mockResolvedValueOnce({data:{state:'busy'}});
 await expect(cachedProvider('jcb','faults:1',load)).rejects.toThrow('upstream');
 await expect(cachedProvider('jcb','faults:1',load)).rejects.toThrow('updating');expect(load).toHaveBeenCalledOnce();expect(db.from).not.toHaveBeenCalled();
});
it('fences cache writes by owner and refuses to publish a lost lease',async()=>{
 db.rpc.mockResolvedValue({data:{state:'load'}});
 const chain={update:vi.fn(()=>chain),eq:vi.fn(()=>chain),select:vi.fn(async()=>({data:[],error:null}))};db.from.mockReturnValue(chain);
 await expect(cachedProvider('jcb','fleet',async()=>({machines:[]}))).rejects.toThrow('store');
 expect(chain.eq).toHaveBeenCalledWith('owner',db.rpc.mock.calls[0][1].p_owner);
});
