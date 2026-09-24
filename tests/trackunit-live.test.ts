import {it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
vi.mock('next/cache',()=>({unstable_cache:(fn:(...args:unknown[])=>unknown)=>{const cache=new Map();return (...args:unknown[])=>{const key=JSON.stringify(args);if(!cache.has(key))cache.set(key,fn(...args));return cache.get(key);};}}));
import {getTrackunitFleet,getTrackunitDetails} from '@/lib/integrations/trackunit/client';
import {applyTelemetry} from '@/lib/integrations/trackunit/normalize';
it.skipIf(process.env.TRACKUNIT_LIVE_CHECK!=='true')('reads actual fleet, positions, faults and telemetry without modifying machines',async()=>{
 const fleet=await getTrackunitFleet();expect(fleet.machines.length).toBeGreaterThan(0);
 let cursor=0,faultErrors=0,telemetryErrors=0,withFaults=0,withHours=0,withFuel=0;
 await Promise.all(Array.from({length:3},async()=>{while(cursor<fleet.machines.length){const machine=fleet.machines[cursor++];const details=await getTrackunitDetails(machine.pin);faultErrors+=Number(details.faultError);telemetryErrors+=Number(details.telemetryError);withFaults+=Number(details.faults.length>0);const enriched=applyTelemetry(machine,details.telemetry);withHours+=Number(!!enriched.hours);withFuel+=Number(!!enriched.fuel);}}));
 console.log(JSON.stringify({machines:fleet.machines.length,positions:fleet.machines.filter(m=>m.position).length,faultErrors,telemetryErrors,withFaults,withHours,withFuel}));
 expect(faultErrors).toBe(0);expect(telemetryErrors).toBe(0);
},180000);
