import {expect,it,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {LinkedJcbMachine} from '@/lib/integrations/jcb/types';
vi.mock('server-only',()=>({}));
vi.mock('@/lib/fleet-operations/server',()=>({allRows:vi.fn(async()=>[{asset_id:'ac',observed_at:'2026-09-28T11:00:00Z',position_history:[{latitude:52,longitude:1,at:'2026-09-27T11:00:00Z'}]}])}));
import {withPositionHistory} from '@/lib/plant-wallboard/history';
const now=Date.parse('2026-09-28T12:00:00Z');
const machine:LinkedJcbMachine={pin:'pin',equipmentId:'1',model:'a',position:null,source:'takeuchi',assetCategory:'Plant',match:'exact',relay:{id:'owned',machine_number:'1',model:'a',make:null,serial_number:null}};
it('recovers missing manufacturer history with exact identity filters and pages past missing positions',async()=>{
 const q={select:vi.fn(),eq:vi.fn(),order:vi.fn(),range:vi.fn()};q.select.mockReturnValue(q);q.eq.mockReturnValue(q);q.order.mockReturnValue(q);
 q.range.mockResolvedValueOnce({data:Array(100).fill({payload:{position:null}}),error:null}).mockResolvedValueOnce({data:[{payload:{position:{latitude:52,longitude:1,at:'2026-09-26T12:00:00Z'}}}],error:null});
 const result=await withPositionHistory({from:()=>q} as unknown as SupabaseClient,[machine],now);
 expect(q.eq.mock.calls).toContainEqual(['machine_id','owned']);expect(q.eq.mock.calls).toContainEqual(['provider','takeuchi']);expect(q.eq.mock.calls).toContainEqual(['pin','pin']);expect(q.range.mock.calls).toEqual([[0,99],[100,199]]);expect(result[0].positionHistory).toHaveLength(1);
});
it('attaches Asset Care history without querying manufacturer samples',async()=>{
 const db={from:vi.fn()};const result=await withPositionHistory(db as unknown as SupabaseClient,[{...machine,source:'assetcare',pin:'ac'}],now);
 expect(result[0].observedAt).toBe('2026-09-28T11:00:00Z');expect(result[0].positionHistory).toHaveLength(1);expect(db.from).not.toHaveBeenCalled();
});
it('surfaces history errors rather than treating failed reads as no GPS',async()=>{
 const q={select:()=>q,eq:()=>q,order:()=>q,range:async()=>({data:null,error:{message:'unavailable'}})};
 await expect(withPositionHistory({from:()=>q} as unknown as SupabaseClient,[machine],now)).rejects.toThrow('history is unavailable');
});
