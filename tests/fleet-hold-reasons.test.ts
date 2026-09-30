import {describe,it,expect} from 'vitest';
import {holdReasons,queueHoldReasons,type HoldEvidence} from '@/lib/fleet-workflow/hold-reasons';
import type {HireAssessment} from '@/lib/fleet-workflow/model';
const evidence:HoldEvidence={tickets:[],faults:[],jobs:[],flags:[]};
const row=(blockers:string[]):HireAssessment=>({machine_id:'demo',status:'on_hold',available:false,version:1,blockers});
describe('clearance hold explanations',()=>{
 it('distinguishes missing plans and unsigned checks from overdue service',()=>{
 const reasons=holdReasons(row(['Workshop inspection required','Parts check required','Service schedule not recorded']),evidence);
 expect(reasons.every(r=>r.category==='check')).toBe(true);
 expect(reasons[2].detail).toContain('not evidence of a missed service');
 });
 it('shows actual service thresholds and excess hours',()=>{
 const r={...row(['Service due by hours','Service due by date']),current_hours:550,state:{location:'yard',arrived_at:null,next_service_date:'2026-01-01',next_service_hours:500,last_service_at:null,departure_status:null,override_reason:null}};
 const reasons=holdReasons(r,evidence);expect(reasons[0].detail).toContain('50 h past threshold');expect(reasons[1].detail).toContain('2026-01-01');
 });
 it('shows only blocker-linked requests, with job reference and status',()=>{
 const r=holdReasons(row(['Open parts request: a']),{...evidence,tickets:[{id:'a',job_number:'DEMO-7',status:'ORDERED',request_summary:'Fictional filter'},{id:'b',job_number:'DONE',status:'COMPLETED',request_summary:'Old request'}]});
 expect(r).toHaveLength(1);expect(r[0].title).toContain('DEMO-7');expect(r[0].detail).toContain('ORDERED');expect(r[0].href).toBe('/tickets/a');
 });
 it('does not call a concurrently completed request open',()=>{
 const r=holdReasons(row(['Open parts request: a']),{...evidence,tickets:[{id:'a',job_number:'DEMO-7',status:'COMPLETED',request_summary:null}]});expect(r[0].title).toContain('completed');expect(r[0].category).toBe('check');
 });
 it('groups repeated critical reports without inventing an active fault status',()=>{
 const f={provider:'jcb',detail:'Fictional warning',occurred_at:'2026-01-01T12:00:00Z',payload:{code:'TEST',severity:'Critical',providerTimestamp:'2026-01-01T12:00:00Z'}};
 const r=holdReasons(row(['Fault requires review: a','Fault requires review: b']),{...evidence,faults:[{id:'a',...f},{id:'b',...f}]});expect(r).toHaveLength(1);expect(r[0].tone).toBe('critical');expect(r[0].title).toContain('TEST');expect(r[0].detail).toContain('Active / resolved state unconfirmed');expect(r[0].detail).toContain('2 reports');
 });
 it('retains missing evidence and manual flag reasons',()=>{
 const r=holdReasons(row(['Fault requires review: absent','Active fleet flag: flag']),{...evidence,flags:[{id:'flag',reason:'Fictional damage'}]});expect(r.map(x=>x.detail).join()).toContain('Fictional damage');expect(r).toHaveLength(2);
 });
});

it('only queues evidenced parts requests, faults and overdue service',()=>{
 const r=row(['Workshop inspection required','Parts check required','Service schedule not recorded','Current service hours need checking','Active fleet flag: f','Open workshop job: w']);
 r.holdReasons=holdReasons(r,{...evidence,flags:[{id:'f',reason:'Manual flag'}]});expect(queueHoldReasons(r)).toEqual([]);
 const due=row(['Service due by hours','Open parts request: a']);due.holdReasons=holdReasons(due,{...evidence,tickets:[{id:'a',job_number:'TEST',status:'COMPLETED',request_summary:null}]});expect(queueHoldReasons(due).map(r=>r.key)).toEqual(['Service due by hours']);
 const fault=row(['Fault requires review: f']);fault.holdReasons=holdReasons(fault,{...evidence,faults:[{id:'f',provider:'jcb',detail:'Test',occurred_at:'2026-01-01T00:00:00Z',payload:{code:'TEST',severity:'Critical'}}]});expect(queueHoldReasons(fault)).toHaveLength(1);
});
