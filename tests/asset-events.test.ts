import {describe,it,expect} from 'vitest';
import {movementEvents,movementHistory,faultEvents,validPosition} from '@/lib/assets/events';
import type {LinkedJcbMachine} from '@/lib/integrations/jcb/types';
const now=Date.parse('2026-09-25T12:00:00Z');
function machine(minutes=0,latitude=52.5,longitude=1):LinkedJcbMachine{return {pin:'PIN',equipmentId:'E',model:'M',source:'takeuchi',match:'confirmed',relay:{id:'m',machine_number:'123',make:'Takeuchi',model:'M',serial_number:'PIN'},position:{latitude,longitude,at:new Date(now-minutes*60000).toISOString()}};}
const sample=(m:LinkedJcbMachine)=>({captured_at:new Date(now).toISOString(),payload:m});
describe('asset event accuracy',()=>{
 it('never infers movement from missing, invalid, future or stale GPS',()=>{for(const p of [null,{latitude:91,longitude:1,at:new Date(now).toISOString()},{latitude:52,longitude:1,at:new Date(now+1).toISOString()}])expect(validPosition(p,now)).toBe(false);expect(movementEvents(machine(1500),[sample(machine(1510,52))],now)[0].kind).toBe('not_checked_in');});
 it('deduplicates cached GPS and ignores collection timestamps',()=>{const m=machine();expect(movementEvents(m,[sample(m),sample(m)],now)).toEqual([]);expect(movementHistory([sample(m),sample(m)],now-86400000,now)).toHaveLength(1);});
 it('requires two new-side reports to confirm arrival or departure',()=>{const outside=machine(30),inside=machine(15,52.392,0.955),latest=machine(0,52.392,0.955);expect(movementEvents(inside,[sample(outside)],now)).toEqual([]);expect(movementEvents(latest,[sample(outside),sample(inside)],now)[0].kind).toBe('yard_arrival');expect(movementEvents(machine(),[sample(machine(30,52.392,0.955)),sample(machine(15))],now)[0].kind).toBe('yard_departure');});
 it('does not connect long gaps or report small GPS drift as movement',()=>{expect(movementEvents(machine(),[sample(machine(150,52.4))],now)).toEqual([]);expect(movementEvents(machine(),[sample(machine(10,52.50001))],now)).toEqual([]);expect(movementHistory([sample(machine(150,52.4)),sample(machine())],now-86400000,now)[1].gapBefore).toBe(true);});
 it('reports meaningful displacement with a stable event key',()=>{const history=[sample(machine(15,52.4))],a=movementEvents(machine(),history,now),b=movementEvents(machine(),history,now+60000);expect(a[0].kind).toBe('movement');expect(a[0].event_key).toBe(b[0].event_key);expect(a[0].detail).toContain('route not recorded');});
 it('does not include stale cached positions in a selected reporting period',()=>{expect(movementHistory([sample(machine(1500))],now-86400000,now)).toEqual([]);});
 it('retains undated faults with an explicit first-observed label',()=>{const event=faultEvents(machine(),[{code:'U',description:'Fault',severity:'unknown',at:null}],now)[0];expect(event.detail).toContain('first observed');expect(event.event_key).toContain('undated');});
 it('deduplicates repeated fault reports without inventing a cleared state',()=>{const m=machine(),fault={code:'P1',description:'Provider fault',severity:'warning',at:new Date(now).toISOString()};expect(faultEvents(m,[fault],now)[0].event_key).toBe(faultEvents(m,[fault],now+60000)[0].event_key);expect(faultEvents(m,[],now)).toEqual([]);});
});
