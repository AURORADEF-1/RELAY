import {expect,it} from 'vitest';
import {reconcilePlantHistory,type YardTimeline} from '@/lib/plant-wallboard/timeline';
import type {BoardMachine} from '@/lib/plant-wallboard/positions';
const now=Date.parse('2026-10-02T12:00:00Z');
const machine:BoardMachine={pin:'a',equipmentId:'a',model:'Plant',source:'jcb',match:'exact',position:null,relay:{id:'m',machine_number:'TEST',make:null,model:null,serial_number:null}};
const history:YardTimeline={provider:'jcb',pin:'a',readings:40,first_at:'2026-09-25T00:00:00Z',last_at:'2026-10-02T11:00:00Z',changes:[{at:'2026-09-25T00:00:00Z',side:1},{at:'2026-09-28T14:33:44Z',side:-1},{at:'2026-09-28T15:21:49Z',side:1}]};
it('counts a short out-and-back even without two outside readings, but never counts initial sightings',()=>{
 const r=reconcilePlantHistory([machine],[history],now);expect(r.events.map(e=>e.kind)).toEqual(['yard_departure','yard_arrival']);expect(r.events[0].occurred_at).toBe('2026-09-28T14:33:44Z');expect(r.machines[0].confirmedYardSide).toBe('off_hire');
});
it('uses one provider stream per machine so delayed secondary fixes cannot double-count a trip',()=>{
 const second={...history,provider:'assetcare',pin:'b',readings:100};
 const r=reconcilePlantHistory([machine,{...machine,source:'assetcare',pin:'b'}],[history,second],now);
 expect(r.events).toHaveLength(2);expect(r.events.every(e=>e.provider==='assetcare')).toBe(true);
});
it('uses a still-reporting alternate stream rather than a stale high-volume tracker',()=>{
 const second={...history,provider:'assetcare',pin:'b',readings:100,last_at:'2026-09-29T10:00:00Z'};
 expect(reconcilePlantHistory([machine,{...machine,source:'assetcare',pin:'b'}],[history,second],now).events.every(e=>e.provider==='jcb')).toBe(true);
});
it('does not associate history with an unmatched machine or a different tracker pin',()=>{
 expect(reconcilePlantHistory([{...machine,relay:null}],[history],now).events).toEqual([]);
 expect(reconcilePlantHistory([{...machine,pin:'other'}],[history],now).events).toEqual([]);
});
