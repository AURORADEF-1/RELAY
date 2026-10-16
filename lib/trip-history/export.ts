import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';

export type ExportTrip={id:string;started_at:string|null;ended_at:string;start_address:string|null;end_address:string|null;distance:number|null;odometer:number|null;speed_kph:number|null;in_progress?:boolean;route_points:Array<{speed_kph:number|null;speeding?:boolean;speed_limit_kph?:number|null}>};
type ExportInput={machine:string;from:string;to:string;trips:ExportTrip[]};
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const miles=(km:number|null)=>finite(km)?km/1.609344:null;
const mph=(kph:number|null)=>finite(kph)?kph/1.609344:null;
const clock=(value:string|null)=>value?new Date(value).toLocaleString('en-GB',{dateStyle:'short',timeStyle:'short'}):'Not supplied';
const durationMinutes=(trip:ExportTrip)=>trip.started_at?Math.max(0,Math.round((Date.parse(trip.ended_at)-Date.parse(trip.started_at))/60000)):null;
const duration=(trip:ExportTrip)=>{const mins=durationMinutes(trip);return mins===null?'Not supplied':mins>=60?`${Math.floor(mins/60)} h ${mins%60} min`:`${mins} min`;};
const speedings=(trip:ExportTrip)=>trip.route_points.filter(point=>point.speeding).length;
const maximumSpeed=(trip:ExportTrip)=>{const values=trip.route_points.flatMap(point=>finite(point.speed_kph)?[point.speed_kph]:[]);return values.length?Math.max(...values):trip.speed_kph;};
const place=(value:string|null)=>value?.trim()||'Position not supplied';
const csvCell=(value:unknown)=>`"${String(value??'').replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')}"`;

export function tripHistoryCsv({machine,from,to,trips}:ExportInput){
 const rows:unknown[][]=[['Machine','Selected from','Selected to','Journey status','Start date/time','End date/time','Start location','End location','Duration (minutes)','Distance (miles)','Odometer (miles)','End speed (mph)','Maximum recorded speed (mph)','Speeding check-ins']];
 for(const trip of trips)rows.push([machine,from,to,trip.in_progress?'In progress':'Completed',clock(trip.started_at),clock(trip.ended_at),place(trip.start_address),place(trip.end_address),durationMinutes(trip),miles(trip.distance)?.toFixed(2)??'',miles(trip.odometer)?.toFixed(1)??'',mph(trip.speed_kph)?.toFixed(1)??'',mph(maximumSpeed(trip))?.toFixed(1)??'',speedings(trip)]);
 return '\ufeff'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
}

const ascii=(value:string)=>value.replace(/[–—]/g,'-').replace(/[^ -~]/g,' ');
const shorten=(value:string,length:number)=>{const clean=ascii(value).replace(/\s+/g,' ').trim();return clean.length<=length?clean:`${clean.slice(0,length-3)}...`;};
export async function tripHistoryPdf({machine,from,to,trips}:ExportInput){
 const doc=await PDFDocument.create(),regular=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);
 const pageSize:[number,number]=[841.89,595.28],margin=34,rowHeight=34,columns=[78,185,185,72,68,64,55],headers=['Started','From','To','Duration','Distance','Max speed','Speeding'];let page=doc.addPage(pageSize),y=pageSize[1]-36;
 const drawText=(text:string,x:number,at:number,size=8,font=regular,color=rgb(.08,.15,.2))=>page.drawText(ascii(text),{x,y:at,size,font,color});
 const header=()=>{drawText('ASSETCARE+ TRIP HISTORY',margin,y,16,bold,rgb(.02,.45,.65));y-=23;drawText(machine,margin,y,13,bold);y-=16;drawText(`Selected dates: ${from} to ${to}   |   Journeys: ${trips.length}   |   Generated: ${new Date().toLocaleString('en-GB')}`,margin,y,8,regular,rgb(.3,.38,.42));y-=24;page.drawRectangle({x:margin,y:y-5,width:pageSize[0]-margin*2,height:22,color:rgb(.04,.18,.24)});let x=margin+5;headers.forEach((label,index)=>{drawText(label,x,y+2,7,bold,rgb(1,1,1));x+=columns[index];});y-=11;};
 const newPage=()=>{page=doc.addPage(pageSize);y=pageSize[1]-36;header();};header();
 for(const [index,trip] of trips.entries()){
  if(y-rowHeight<32)newPage();if(index%2===1)page.drawRectangle({x:margin,y:y-rowHeight+5,width:pageSize[0]-margin*2,height:rowHeight,color:rgb(.94,.97,.98)});
  const values=[clock(trip.started_at),place(trip.start_address),place(trip.end_address),duration(trip),`${miles(trip.distance)?.toFixed(2)??'-'} mi`,`${mph(maximumSpeed(trip))?.toFixed(1)??'-'} mph`,String(speedings(trip))];let x=margin+5;
  values.forEach((value,column)=>{const max=column===1||column===2?42:column===0?18:14,parts=shorten(value,max).match(new RegExp(`.{1,${Math.max(8,Math.floor(max/2))}}(?:\\s|$)|.{1,${Math.max(8,Math.floor(max/2))}}`,'g'))?.slice(0,2)??[value];parts.forEach((part,line)=>drawText(part.trim(),x,y-line*9,7,column===6&&speedings(trip)>0?bold:regular,column===6&&speedings(trip)>0?rgb(.75,.08,.12):rgb(.08,.15,.2)));x+=columns[column];});
  page.drawLine({start:{x:margin,y:y-rowHeight+5},end:{x:pageSize[0]-margin,y:y-rowHeight+5},thickness:.4,color:rgb(.75,.82,.85)});y-=rowHeight;
 }
 const pages=doc.getPages();pages.forEach((item,index)=>item.drawText(`Page ${index+1} of ${pages.length}`,{x:pageSize[0]-margin-55,y:18,size:7,font:regular,color:rgb(.35,.42,.45)}));
 return doc.save();
}
