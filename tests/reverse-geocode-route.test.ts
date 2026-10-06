import {beforeEach,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';

vi.mock('server-only',()=>({}));
const mocks=vi.hoisted(()=>({authorize:vi.fn()}));
vi.mock('@/lib/assets/access',()=>({authorizeAssets:mocks.authorize}));
vi.mock('@/lib/integrations/jcb/server',()=>({jcbJson:(body:unknown,status=200)=>Response.json(body,{status}),jcbError:(error:unknown)=>Response.json({error:error instanceof Error?error.message:'Error'},{status:(error as {status?:number})?.status??500})}));

import {GET} from '@/app/api/maps/reverse-geocode/route';

beforeEach(()=>vi.restoreAllMocks());

it('uses a read-only authenticated GET for batched map positions',async()=>{
 mocks.authorize.mockResolvedValue({admin:false});
 vi.stubEnv('MAPTILER_KEY','test-key');
 const upstream=vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json([{features:[{place_type:['address'],place_name_en:'MLP Yard'}]}]));
 const response=await GET(new NextRequest('https://relay.test/api/maps/reverse-geocode?points=1.2345%2C52.3456'));
 expect(response.status).toBe(200);
 expect(await response.json()).toEqual({addresses:['MLP Yard']});
 expect(mocks.authorize).toHaveBeenCalledOnce();
 expect(upstream.mock.calls[0]?.[0]).toContain('/geocoding/1.23450,52.34560.json');
});

it('rejects malformed or excessive coordinate batches before contacting the provider',async()=>{
 mocks.authorize.mockResolvedValue({admin:false});
 const upstream=vi.spyOn(globalThis,'fetch');
 for(const points of ['', '1,not-a-number', Array.from({length:51},()=> '1,52').join(';')]){
  const response=await GET(new NextRequest(`https://relay.test/api/maps/reverse-geocode?${new URLSearchParams({points})}`));
  expect(response.status).toBe(400);
 }
 expect(upstream).not.toHaveBeenCalled();
});
