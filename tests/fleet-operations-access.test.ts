import {beforeEach,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
vi.mock('server-only',()=>({}));
const auth=vi.hoisted(()=>({requester:vi.fn()}));
vi.mock('@/lib/integrations/rico/route-auth',()=>({authorizeRelayRequesterRoute:auth.requester}));
import {authorizeOperations} from '@/lib/fleet-operations/server';
import {GET} from '@/app/api/cron/fleet-operations/[provider]/route';
beforeEach(()=>vi.clearAllMocks());
it('requires login and exact administrator role',async()=>{
 auth.requester.mockResolvedValue({ok:false,status:401,error:'Authentication required.'});await expect(authorizeOperations(new NextRequest('https://relay.test'))).rejects.toMatchObject({status:401});
 for(const role of ['requester','fitter','customer','front_counter','Admin']){auth.requester.mockResolvedValue({ok:true,user:{id:'user'},supabase:{from:()=>({select:()=>({eq:()=>({single:async()=>({data:{role}})})})})}});await expect(authorizeOperations(new NextRequest('https://relay.test'))).rejects.toMatchObject({status:403});}
});
it('rejects unauthenticated collection without touching providers or storage',async()=>{const response=await GET(new NextRequest('https://relay.test/api/cron/fleet-operations/jcb'),{params:Promise.resolve({provider:'jcb'})});expect(response.status).toBe(401);});
