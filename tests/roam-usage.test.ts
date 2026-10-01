import {describe,it,expect} from 'vitest';
import fixture from './fixtures/roam-current-hires.json';
import {hirePageSchema} from '@/lib/integrations/roam/hires';
import {calculateHireUsage,meter} from '@/lib/integrations/roam/usage';
const now=Date.parse('2026-09-30T12:00:00Z');
function hire(){const h=structuredClone(hirePageSchema.parse(fixture).items[0]);h.delivery={delivered_at:'2026-09-30T08:00:03Z',machine_hours:null};h.collection={};return h;}
const readings=[{value:100,at:'2026-09-30T08:00:00Z'},{value:102.5,at:'2026-09-30T11:59:00Z',ignition:false}];
describe('contract hours used',()=>{
 it('calculates telemetry usage from the counter near delivery, not elapsed hire time',()=>{expect(calculateHireUsage(hire(),readings,'Asset Care+',now)).toMatchObject({hours:2.5,source:'telematics',stale:false})});
 it('uses paired driver readings when both are supplied',()=>{const h=hire();h.delivery.machine_hours=700;h.collection={collected_at:'2026-09-30T11:59:00Z',machine_hours:702};expect(calculateHireUsage(h,readings,'Asset Care+',now)).toMatchObject({hours:2,source:'driver'})});
 it('does not mix a driver counter with a tracker counter',()=>{const h=hire();h.delivery.machine_hours=700;expect(calculateHireUsage(h,readings,'Asset Care+',now).hours).toBe(2.5)});
 it('does not treat missing counters or scheduled delivery as zero usage',()=>{expect(calculateHireUsage(hire(),[],'',now).hours).toBeNull();expect(calculateHireUsage({...hire(),status:'scheduled'},readings,'',now).hours).toBeNull();expect(meter(null)).toBeNull();expect(meter('')).toBeNull()});
 it('rejects a starting reading too far from delivery or after delivery',()=>{for(const at of ['2026-09-30T07:00:00Z','2026-09-30T08:01:00Z'])expect(calculateHireUsage(hire(),[{value:100,at},readings[1]],'',now).hours).toBeNull()});
 it('rejects resets and implausible increments',()=>{for(const value of [90,200])expect(calculateHireUsage(hire(),[readings[0],{...readings[1],value}],'',now).hours).toBeNull()});
 it('marks stale readings and excludes future readings',()=>{expect(calculateHireUsage(hire(),readings,'',now+3600000).stale).toBe(true);expect(calculateHireUsage(hire(),[readings[0],{value:104,at:'2026-10-01T12:00:00Z'}],'',now).hours).toBeNull()});
 it('does not keep accumulating after collection',()=>{const h=hire();h.collection={collected_at:'2026-09-30T10:00:00Z'};expect(calculateHireUsage(h,readings,'',now).hours).toBeNull();expect(calculateHireUsage(h,[...readings,{value:101,at:'2026-09-30T09:59:00Z',ignition:false}],'',now).hours).toBe(1)});
 it('retains a genuine zero counter change',()=>{expect(calculateHireUsage(hire(),[readings[0],{...readings[1],value:100}],'',now).hours).toBe(0)});
});

describe('collection stops the contract clock',()=>{
 it('freezes at pickup with ignition off, ignoring later running and a later hire',()=>{const h=hire();h.status='collected';h.collection={collected_at:'2026-09-30T10:00:00Z'};const rows=[readings[0],{value:101,at:'2026-09-30T09:59:00Z',ignition:false},{value:103,at:'2026-09-30T12:00:00Z',ignition:true}];expect(calculateHireUsage(h,rows,'Asset Care+',now)).toMatchObject({hours:1,finalized:true,stale:false});expect(calculateHireUsage(h,rows,'Asset Care+',now+86400000).hours).toBe(1)});
 it('waits for ignition-off confirmation rather than letting transport add hours',()=>{const h=hire();h.status='collected';h.collection={collected_at:'2026-09-30T10:00:00Z'};expect(calculateHireUsage(h,[readings[0],{value:102,at:'2026-09-30T10:01:00Z',ignition:true}],'Asset Care+',now)).toMatchObject({hours:null,finalized:false})});
 it('uses the first ignition-off report near pickup and ignores a later restart',()=>{const h=hire();h.collection={collected_at:'2026-09-30T10:00:00Z'};expect(calculateHireUsage(h,[readings[0],{value:101,at:'2026-09-30T10:02:00Z',ignition:false},{value:102,at:'2026-09-30T11:00:00Z',ignition:true}],'Asset Care+',now)).toMatchObject({hours:1,finalized:true,stoppedAt:'2026-09-30T10:02:00.000Z'})});
 it('does not accept ignition off hours after collection',()=>{const h=hire();h.collection={collected_at:'2026-09-30T10:00:00Z'};expect(calculateHireUsage(h,readings,'Asset Care+',now).hours).toBeNull()});
});
