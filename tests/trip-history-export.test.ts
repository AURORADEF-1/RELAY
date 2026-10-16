import {expect,it} from 'vitest';
import {PDFDocument} from 'pdf-lib';
import {tripHistoryCsv,tripHistoryPdf,type ExportTrip} from '@/lib/trip-history/export';

const trip:ExportTrip={id:'t1',started_at:'2026-10-16T06:56:00Z',ended_at:'2026-10-16T08:10:00Z',start_address:'17 Beach Road',end_address:'Mervyn Lambert Yard',distance:64.824,odometer:37140,speed_kph:94.95,route_points:[{speed_kph:80,speeding:true,speed_limit_kph:70},{speed_kph:90,speeding:true,speed_limit_kph:70}]};

it('creates an understandable spreadsheet-safe CSV journey summary',()=>{
 const csv=tripHistoryCsv({machine:'GL71 EFD - Jamie Darby',from:'2026-10-16',to:'2026-10-16',trips:[trip]});
 expect(csv).toContain('Start location');expect(csv).toContain('17 Beach Road');expect(csv).toContain('40.28');expect(csv).toContain('"2"');
});

it('creates a readable multi-page-capable PDF',async()=>{
 const bytes=await tripHistoryPdf({machine:'GL71 EFD - Jamie Darby',from:'2026-10-16',to:'2026-10-16',trips:Array.from({length:30},(_,index)=>({...trip,id:`t${index}`}))});
 expect(new TextDecoder().decode(bytes.slice(0,5))).toBe('%PDF-');expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1);
});
