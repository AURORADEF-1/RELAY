import {beforeEach,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
vi.mock('server-only',()=>({}));
const mocks=vi.hoisted(()=>({machines:vi.fn()}));
vi.mock('@/lib/trip-history/machines',()=>({tripMachinesForViewer:mocks.machines}));
import {GET} from '@/app/api/assets/trip-machines/route';

beforeEach(()=>{vi.resetAllMocks();mocks.machines.mockResolvedValue([{id:'plant',name:'24102 Mini Excavator',group:'Plant'},{id:'van',name:'Jamie Darby',group:'Workshop'}]);});

it('returns only matching machines from the server-authorized fleet projection',async()=>{
 const response=await GET(new NextRequest('https://relay.test/api/assets/trip-machines?q=24102'));
 expect(response.status).toBe(200);
 expect(await response.json()).toEqual({machines:[{id:'plant',name:'24102 Mini Excavator',group:'Plant'}]});
 expect(response.headers.get('cache-control')).toBe('private, no-store');
});

it('does not load the fleet for incomplete searches',async()=>{
 const response=await GET(new NextRequest('https://relay.test/api/assets/trip-machines?q=2'));
 expect(await response.json()).toEqual({machines:[]});
 expect(mocks.machines).not.toHaveBeenCalled();
});
