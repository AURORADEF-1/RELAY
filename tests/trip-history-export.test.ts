import {expect,it} from 'vitest';
import {PDFDocument} from 'pdf-lib';
import {tripHistoryCsv,tripHistoryPdf,type ExportTrip} from '@/lib/trip-history/export';

const trip:ExportTrip={id:'t1',started_at:'2026-10-16T06:56:00Z',ended_at:'2026-10-16T08:10:00Z',start_address:'17 Beach Road',end_address:'Mervyn Lambert Yard',distance:64.824,odometer:37140,speed_kph:94.95,route_points:[{at:'2026-10-16T07:00:00Z',latitude:52.45,longitude:1.73,speed_kph:80,ignition:true,power_voltage:14.22,tracker_battery_voltage:4.05,speeding:true,speed_limit_kph:70,address:'A12, Blythburgh'},{at:'2026-10-16T07:05:00Z',latitude:52.5,longitude:1.7,speed_kph:90,ignition:true,power_voltage:14.18,tracker_battery_voltage:4.05,speeding:true,speed_limit_kph:70,address:'A145, Beccles'}]};

it('creates an understandable pin-level CSV with road and telemetry details',()=>{
 const csv=tripHistoryCsv({machine:'GL71 EFD - Jamie Darby',from:'2026-10-16',to:'2026-10-16',trips:[trip]});
 expect(csv).toContain('Road / location');expect(csv).toContain('A12, Blythburgh');expect(csv).toContain('Power voltage (V)');expect(csv).toContain('"14.22"');expect(csv.split('\r\n')).toHaveLength(3);
});

it('creates a readable multi-page-capable PDF',async()=>{
 const bytes=await tripHistoryPdf({machine:'GL71 EFD - Jamie Darby',from:'2026-10-16',to:'2026-10-16',trips:Array.from({length:30},(_,index)=>({...trip,id:`t${index}`}))});
 expect(new TextDecoder().decode(bytes.slice(0,5))).toBe('%PDF-');expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1);
});
