import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {historyTime,type HistoryReport} from './history';
export async function historyPdf(r:HistoryReport){
 const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);
 doc.setTitle('RELAY staff vehicle history');
 let page=doc.addPage([595,842]),y=795;
 const room=(height:number)=>{if(y-height<40){page=doc.addPage([595,842]);page.drawText('RELAY | Staff vehicle history (continued)',{x:40,y:795,size:10,font:bold});y=770;}};
 const clean=(s:string)=>s.replace(/[–—]/g,'-').replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/[^\x20-\x7e\xa0-\xff]/g,'?');
 const line=(value:string,strong=false)=>{
  const f=strong?bold:font;let current='';
  const draw=()=>{room(15);page.drawText(current,{x:40,y,size:10,font:f,color:rgb(.08,.12,.16)});y-=15;};
  // Wrap at word boundaries, with a fallback for long asset/event identifiers.
  for(const word of clean(value).split(/\s+/)){
   if(current&&f.widthOfTextAtSize(current+' '+word,10)>515){draw();current='';}
   if(current)current+=' ';
   for(const c of word){if(f.widthOfTextAtSize(current+c,10)>515){draw();current='';}current+=c;}
  }draw();
 };
 line('RELAY | Staff vehicle history',true);line(r.label,true);line(`Current department: ${r.department}`);line(`Asset: ${r.id}`);line(`Generated: ${r.generated} UK`);
 for(const n of r.notes)line(n);line('');line('DAILY SUMMARY',true);
 for(const d of r.daily){room(75);line(d.day,true);line(`First arrival: ${d.firstArrival} | Last departure: ${d.lastDeparture}`);line(`${d.returnStatus} | Speeding alerts: ${d.speedingCount}`);line('');}
 line('ALL RECORDED EVENTS (oldest first)',true);
 if(!r.events.length)line('No events received for the selected range.');
 for(const e of r.events){room(45);line(`${historyTime(e.occurred_at)} | ${e.kind}${e.kind==='speeding'?` | Speed ${e.speed_kph??'unknown'} km/h | Threshold ${e.limit_kph??'unknown'} km/h`:''}`);line(`Event: ${e.event_id}`);}
 const pages=doc.getPages();pages.forEach((p,i)=>p.drawText(`RELAY | ${r.from} to ${r.to} | UK time | Page ${i+1} of ${pages.length}`,{x:40,y:28,size:8,font}));
 return doc.save();
}
