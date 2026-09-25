import {beforeEach,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
vi.mock('server-only',()=>({}));
const auth=vi.hoisted(()=>({requester:vi.fn()}));
vi.mock('@/lib/integrations/rico/route-auth',()=>({authorizeRelayRequesterRoute:auth.requester}));
import {authorizeAssets} from '@/lib/assets/access';
const request=new NextRequest('https://relay.test/api/assets');
function session(role:string,grant=false){return {ok:true,user:{id:'u'},supabase:{from:()=>{const q={select:()=>q,eq:()=>q,single:async()=>({data:{role}}),maybeSingle:async()=>({data:grant?{user_id:'u'}:null})};return q;}}};}
beforeEach(()=>vi.clearAllMocks());
it('requires authentication',async()=>{auth.requester.mockResolvedValue({ok:false,status:401,error:'Sign in'});await expect(authorizeAssets(request)).rejects.toMatchObject({status:401});});
it('allows exact admins to search and use inbox',async()=>{auth.requester.mockResolvedValue(session('admin'));expect((await authorizeAssets(request,true)).admin).toBe(true);});
it('allows explicitly granted fitters to search, but not use inbox',async()=>{auth.requester.mockResolvedValue(session('requester',true));expect((await authorizeAssets(request)).admin).toBe(false);await expect(authorizeAssets(request,true)).rejects.toMatchObject({status:403});});
it('rejects ungranted requesters, customers and front counter',async()=>{for(const role of ['requester','customer','front_counter','Admin']){auth.requester.mockResolvedValue(session(role));await expect(authorizeAssets(request)).rejects.toMatchObject({status:403});}});
