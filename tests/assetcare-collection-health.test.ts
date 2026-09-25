import {expect,it} from 'vitest';
import {collectionHealth} from '@/lib/integrations/assetcare/collection-health';
const now=Date.parse('2026-09-25T15:00:00Z');
const ago=(minutes:number)=>new Date(now-minutes*60000).toISOString();
const state={last_attempt_at:ago(1),last_ack_at:ago(1),last_error:null,last_cycle:{drained:false,latestReceivedAt:ago(31)}};
it('warns for a backlog exceeding 30 minutes even when acknowledgements are recent',()=>{expect(collectionHealth(state,now)).toMatchObject({warning:true,minutes:31});expect(collectionHealth({...state,last_cycle:{drained:false,latestReceivedAt:ago(30)}},now).warning).toBe(false);});
it('does not confuse old tracker readings with a recently confirmed empty queue',()=>{expect(collectionHealth({...state,last_cycle:{drained:true,latestReceivedAt:ago(300)}},now).warning).toBe(false);});
it('warns for missed collections and provider failures even after an empty queue',()=>{expect(collectionHealth({...state,last_ack_at:ago(31),last_cycle:{drained:true}},now).warning).toBe(true);expect(collectionHealth({...state,last_error:'Unavailable',last_cycle:{drained:true}},now).warning).toBe(true);});
it('never describes unknown or invalid receipt times as within target',()=>{for(const latestReceivedAt of [undefined,'bad',ago(-1)])expect(collectionHealth({...state,last_cycle:{drained:false,latestReceivedAt}},now).message).toContain('not yet confirmed');});
