import {describe,it,expect} from "vitest";
import {assessMachine,faultAdvice,latestFaults} from "@/lib/integrations/jcb/health";
import type {LinkedJcbMachine,JcbFault} from "@/lib/integrations/jcb/types";
const now=Date.parse('2026-09-24T10:00:00Z');
const machine:LinkedJcbMachine={pin:'TEST',equipmentId:'1',model:'535',relay:null,match:'unmatched',position:{latitude:52,longitude:1,at:'2026-09-24T09:00:00Z'},fuel:{value:10,at:'2026-09-24T09:00:00Z'}};
const fault:JcbFault={code:'X',description:'Over temperature reported',severity:'Major',at:'2026-09-24T09:00:00Z'};
describe('JCB triage rules',()=>{
 it('raises a recent serious report without claiming active status or a repair diagnosis',()=>{const advice=faultAdvice(fault,now);expect(advice.priority).toBe('urgent');expect(advice.notify).toBe(true);expect(advice.action).toContain('if a stop warning');});
 it('never notifies for historic, undated or future faults',()=>{for(const at of ['2026-08-01T00:00:00Z',null,'2027-01-01T00:00:00Z']){const advice=faultAdvice({...fault,at},now);expect(advice.priority).toBe('info');expect(advice.notify).toBe(false);}});
 it('keeps a 3-day major fault visible but does not send a new alert',()=>{const advice=faultAdvice({...fault,at:'2026-09-21T10:00:00Z'},now);expect(advice.priority).toBe('urgent');expect(advice.notify).toBe(false);});
 it('does not invent meanings for unknown fault codes',()=>{const advice=faultAdvice({...fault,description:'No description supplied'},now);expect(advice.detail).toContain('without an explanation');});
 it('deduplicates repeat fault events using latest report time',()=>{expect(latestFaults([fault,{...fault,at:'2026-09-23T10:00:00Z'},fault])).toEqual([fault]);});
 it('only recommends replenishment for fresh low readings',()=>{expect(assessMachine(machine,[],false,now).issues.some(i=>i.key==='fuel'&&i.notify)).toBe(true);const stale=assessMachine({...machine,fuel:{value:0,at:'2026-08-01T00:00:00Z'}},[],false,now);expect(stale.issues.some(i=>i.key==='fuel')).toBe(false);expect(stale.issues.find(i=>i.key==='stale:fuel')?.notify).toBe(false);});
 it('treats a fault API failure as an incomplete assessment',()=>{expect(assessMachine(machine,[],true,now).issues.some(i=>i.key==='connection')).toBe(true);});
 it('flags missing and stale locations independently of engine state',()=>{expect(assessMachine({...machine,position:null},[],false,now).issues.find(i=>i.key==='position')?.notify).toBe(true);});
});
