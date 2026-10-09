import {afterEach,describe,expect,it,vi} from 'vitest';

const auth=vi.hoisted(()=>({getSupabaseAccessToken:vi.fn(),getSupabaseClient:vi.fn()}));
vi.mock('@/lib/supabase',()=>auth);
import {assetRequest} from '@/components/assets/request';

describe('assetRequest',()=>{
 afterEach(()=>vi.unstubAllGlobals());
 it('turns an HTML route response into a useful app error',async()=>{
  auth.getSupabaseAccessToken.mockResolvedValue('token');
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('<!DOCTYPE html>',{status:404,headers:{'Content-Type':'text/html'}})));
  await expect(assetRequest('/missing')).rejects.toThrow('Asset information unavailable. Please refresh and try again.');
 });
 it('preserves JSON API errors',async()=>{
  auth.getSupabaseAccessToken.mockResolvedValue('token');
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({error:'Fault check unavailable.'}),{status:503,headers:{'Content-Type':'application/json'}})));
  await expect(assetRequest('/faults')).rejects.toThrow('Fault check unavailable.');
 });
});
