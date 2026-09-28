import {expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {staffRow} from '@/lib/staff/model';
import type {LinkedJcbMachine} from '@/lib/integrations/jcb/types';
const now=Date.parse('2026-09-28T12:00:00Z'),at=(m:number)=>new Date(now+m*60000).toISOString();
const inside={latitude:52.392,longitude:.955,at:at(-1)},outside={latitude:52,longitude:1,at:at(-1)};
const machine={pin:'person',equipmentId:'DEMO VAN - Example Person',assetGroup:'Workshop',position:inside} as LinkedJcbMachine;
it('reports vehicle presence, retains old GPS and rejects future GPS',()=>{expect(staffRow(machine,[],now).status).toBe('in');expect(staffRow({...machine,position:outside},[],now).status).toBe('out');expect(staffRow({...machine,position:{...inside,at:at(-31)}},[],now).status).toBe('in');expect(staffRow({...machine,position:{...inside,at:at(1)}},[],now).status).toBe('unknown');});
it('requires a second distinct observation to confirm a crossing',()=>{expect(staffRow(machine,[{...outside,at:at(-3)}],now).status).toBe('unknown');const result=staffRow(machine,[{...outside,at:at(-3)},{...inside,at:at(-2)}],now);expect(result.status).toBe('in');expect(result.crossing).toEqual({label:'Vehicle arrived',at:at(-1)});expect(staffRow(machine,[{...outside,at:at(-3)},inside],now).status).toBe('unknown');});
it('does not invent an arrival time from a single inside reading',()=>{expect(staffRow(machine,[],now).crossing).toBeNull();});

it('retains days-old locations with an explicit last-known label',()=>{for(const [position,status] of [[inside,'in'],[outside,'out']] as const){const row=staffRow({...machine,position:{...position,at:at(-4320)}},[],now);expect(row.status).toBe(status);expect(row.lastKnown).toBe(true);expect(row.reason).toContain('Not checked in');expect(row.position?.at).toBe(at(-4320));}});
it('keeps undated coordinates without manufacturing a GPS time',()=>{const row=staffRow({...machine,position:{...inside,at:null}},[],now);expect(row.status).toBe('in');expect(row.lastKnown).toBe(true);expect(row.position?.at).toBeNull();expect(row.reason).toContain('GPS time unavailable');});
it('falls back to valid stored GPS and leaves missing coordinates uncertain',()=>{const row=staffRow({...machine,position:{...inside,at:at(1)}},[{...outside,at:at(-3000)}],now);expect(row.status).toBe('out');expect(row.lastKnown).toBe(true);expect(staffRow({...machine,position:null},[],now).status).toBe('unknown');expect(staffRow({...machine,position:{latitude:0,longitude:0,at:null}},[],now).position).toBeNull();});
