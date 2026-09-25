import {expect,it} from 'vitest';
import {projectYardInbox} from '@/lib/integrations/assetcare/yard-inbox';
const now=Date.parse('2026-09-25T12:00:00Z');
const registry=[{id:'relay',machine_number:'26405',make:'XCMG',model:'XE135E',serial_number:null}];
const row=(minutes:number,inside:boolean)=>({type:'telemetry',owner:{id:'MLP'},asset:{id:'a',name:'26405 - XCMG'},date:new Date(now-minutes*60000).toISOString(),location:{lat:inside?52.392:52.5,lon:inside?.955:1,age:0}});
it('records one confirmed return across batches and ignores repeats, older records and parked reports',()=>{
 const outside=projectYardInbox([row(180,true),row(150,false)],'MLP',[],registry,new Set(['relay']),now);
 const first=projectYardInbox([row(5,true)],'MLP',outside,registry,new Set(['relay']),now);expect(first[0].events).toEqual([]);
 const next=projectYardInbox([row(0,true)],'MLP',first,registry,new Set(['relay']),now);expect(next[0].events).toHaveLength(1);expect(next[0].events[0].title).toBe('Returned to Yard');expect(next[0].events[0].provider).toBe('assetcare');
 expect(projectYardInbox([row(0,true),row(10,false)],'MLP',next,registry,new Set(['relay']),now)[0].events).toEqual([]);
 expect(projectYardInbox([row(-1,true)],'MLP',next,registry,new Set(['relay']),now+60000)[0].events).toEqual([]);
});
it('uses every report in a batch and does not infer returns for initial yard sightings or excluded assets',()=>{
 const reports=[row(0,true),row(30,false),row(5,true)];
 expect(projectYardInbox(reports,'MLP',[],registry,new Set(['relay']),now)[0].events).toHaveLength(1);
 expect(projectYardInbox(reports,'MLP',[],registry,new Set(),now)[0].events).toEqual([]);
 expect(projectYardInbox(reports,'MLP',[],[],new Set(),now)[0].events).toEqual([]);
 expect(projectYardInbox([row(5,true),row(0,true)],'MLP',[],registry,new Set(['relay']),now)[0].events).toEqual([]);
 expect(projectYardInbox(reports,'OTHER',[],registry,new Set(['relay']),now)).toEqual([]);
});
