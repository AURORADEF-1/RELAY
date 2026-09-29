import {expect,it} from 'vitest';
import {PDFDocument} from 'pdf-lib';
import {historyRange,historyReport,historyCsv,csvCell} from '@/lib/staff/history';
import {historyPdf} from '@/lib/staff/history-pdf';
const now=Date.parse('2026-10-27T12:00:00Z');
it('validates inclusive UK dates and DST boundaries',()=>{
 expect(historyRange('2026-10-25','2026-10-25',now).end-historyRange('2026-10-25','2026-10-25',now).start).toBe(25*3600000);
 expect(historyRange('2026-03-29','2026-03-29',now).end-historyRange('2026-03-29','2026-03-29',now).start).toBe(23*3600000);
 for(const [a,b] of [['2026-02-30','2026-03-01'],['2026-10-02','2026-10-01'],['2026-10-28','2026-10-28'],['2026-09-01','2026-10-02']])expect(()=>historyRange(a,b,now)).toThrow();
});
const event={asset_id:'a',event_id:'e',kind:'arrival' as const,occurred_at:'2026-10-25T09:00:00Z'};
const report=(events=[event])=>historyReport({id:'a',label:'Test driver',department:'Workshop'},historyRange('2026-10-25','2026-10-26',now),events,'2026-10-25T10:00:00Z',new Date(now).toISOString(),now);
it('deduplicates and isolates one asset and exact range, keeping empty days and coverage warnings',()=>{
 const r=report([event,event,{...event,asset_id:'b'},{...event,event_id:'old',occurred_at:'2026-10-24T12:00:00Z'}]);expect(r.events).toHaveLength(1);expect(r.daily).toHaveLength(2);expect(r.daily[1].returnStatus).toBe('No yard events recorded');expect(r.notes.join(' ')).toContain('INCOMPLETE COVERAGE');
});
it('neutralises spreadsheet formulas and quotes embedded CSV delimiters',()=>{
 for(const s of ['=cmd',' +cmd','\tcmd','@SUM(A1)','-1'])expect(csvCell(s)).toMatch(/^"'/);
 expect(csvCell('a,"b"')).toBe('"a,""b"""');expect(historyCsv(report())).toContain('All recorded events');
});
it('exports all alerts and produces a real multipage PDF',async()=>{
 const events=Array.from({length:80},(_,i)=>({...event,event_id:`event-${i}`}));const r=report(events);expect(r.events).toHaveLength(80);
 const bytes=await historyPdf(r);expect(new TextDecoder().decode(bytes.slice(0,5))).toBe('%PDF-');const pdf=await PDFDocument.load(bytes);expect(pdf.getPageCount()).toBeGreaterThan(2);
 expect(()=>report(Array.from({length:10001},()=>event))).toThrow('shorter');
});
