import {describe,it,expect} from 'vitest';
import fixture from './fixtures/roam-current-hires.json';
import {hirePageSchema} from '@/lib/integrations/roam/hires';
import {calculateHireUsage,meter} from '@/lib/integrations/roam/usage';
const now=Date.parse('2026-09-30T12:00:00Z');
function hire(){const h=structuredClone(hirePageSchema.parse(fixture).items[0]);h.delivery={delivered_at:'2026-09-30T08:00:03Z',machine_hours:null};h.collection={};return h;}
const readings=[{value:100,at:'2026-09-30T08:00:00Z'},{value:102.5,at:'2026-09-30T11:59:00Z'}];
describe('contract hours used',()=>{
 it('calculates telemetry usage from the counter near delivery, not elapsed hire time',()=>{expect(calculateHireUsage(hire(),readings,'Asset Care+',now)).toMatchObject({hours:2.5,source:'telematics',stale:false})});
 it('uses paired driver readings when both are supplied',()=>{const h=hire();h.delivery.machine_hours=700;h.collection={collected_at:'2026-09-30T11:59:00Z',machine_hours:702};expect(calculateHireUsage(h,readings,'Asset Care+',now)).toMatchObject({hours:2,source:'driver'})});
 it('does not mix a driver counter with a tracker counter',()=>{const h=hire();h.delivery.machine_hours=700;expect(calculateHireUsage(h,readings,'Asset Care+',now).hours).toBe(2.5)});
 it('does not treat missing counters or scheduled delivery as zero usage',()=>{expect(calculateHireUsage(hire(),[],'',now).hours).toBeNull();expect(calculateHireUsage({...hire(),status:'scheduled'},readings,'',now).hours).toBeNull();expect(meter(null)).toBeNull();expect(meter('')).toBeNull()});
 it('rejects a starting reading too far from delivery or after delivery',()=>{for(const at of ['2026-09-30T07:00:00Z','2026-09-30T08:01:00Z'])expect(calculateHireUsage(hire(),[{value:100,at},readings[1]],'',now).hours).toBeNull()});
 it('rejects resets and implausible increments',()=>{for(const value of [90,200])expect(calculateHireUsage(hire(),[readings[0],{...readings[1],value}],'',now).hours).toBeNull()});
 it('marks stale readings and excludes future readings',()=>{expect(calculateHireUsage(hire(),readings,'',now+3600000).stale).toBe(true);expect(calculateHireUsage(hire(),[readings[0],{value:104,at:'2026-10-01T12:00:00Z'}],'',now).hours).toBeNull()});
 it('does not keep accumulating after collection',()=>{const h=hire();h.collection={collected_at:'2026-09-30T10:00:00Z'};expect(calculateHireUsage(h,readings,'',now).hours).toBeNull();expect(calculateHireUsage(h,[...readings,{value:101,at:'2026-09-30T09:59:00Z'}],'',now).hours).toBe(1)});
 it('retains a genuine zero counter change',()=>{expect(calculateHireUsage(hire(),[readings[0],{...readings[1],value:100}],'',now).hours).toBe(0)});
});
