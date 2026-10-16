import {PDFDocument,PDFFont,PDFImage,StandardFonts,rgb} from 'pdf-lib';

export type ExportTrip={id:string;started_at:string|null;ended_at:string;start_address:string|null;end_address:string|null;distance:number|null;odometer:number|null;speed_kph:number|null;in_progress?:boolean;route_points:Array<{at:string;latitude:number;longitude:number;speed_kph:number|null;ignition:boolean|null;power_voltage:number|null;tracker_battery_voltage:number|null;speeding?:boolean;speed_limit_kph?:number|null;address?:string|null}>};
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
const reportDate=(value:string)=>{const [year,month,day]=value.split('-');return day&&month&&year?`${day}/${month}/${year}`:value;};
const csvCell=(value:unknown)=>`"${String(value??'').replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')}"`;

export function tripHistoryCsv({machine,from,to,trips}:ExportInput){
 const rows:unknown[][]=[['Machine','Selected from','Selected to','Journey ID','Journey status','Journey start','Journey end','Journey from','Journey to','Journey duration (minutes)','Journey distance (miles)','Odometer (miles)','Pin number','Pin date/time','Road / location','Latitude','Longitude','Speed (mph)','Speed limit (mph)','Amount over limit (mph)','Speed status','Ignition','Power voltage (V)','Tracker battery (V)']];
 for(const trip of trips){
  const points=trip.route_points.length?trip.route_points:[{at:trip.ended_at,latitude:NaN,longitude:NaN,speed_kph:trip.speed_kph,ignition:null,power_voltage:null,tracker_battery_voltage:null,address:trip.end_address}];
  points.forEach((point,index)=>{const speed=mph(point.speed_kph),limit=mph(point.speed_limit_kph??null),over=finite(speed)&&finite(limit)?Math.max(0,speed-limit):null,status=point.speeding?(finite(point.speed_kph)&&finite(point.speed_limit_kph)&&point.speed_kph<=point.speed_limit_kph*1.1?'Speeding - amber':'Speeding - red'):'Within limit',coordinates=finite(point.latitude)&&finite(point.longitude)?`${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`:'';rows.push([machine,from,to,trip.id,trip.in_progress?'In progress':'Completed',clock(trip.started_at),clock(trip.ended_at),place(trip.start_address),place(trip.end_address),durationMinutes(trip),miles(trip.distance)?.toFixed(2)??'',miles(trip.odometer)?.toFixed(1)??'',index+1,clock(point.at),point.address?.trim()||coordinates||'Position not supplied',finite(point.latitude)?point.latitude.toFixed(6):'',finite(point.longitude)?point.longitude.toFixed(6):'',speed?.toFixed(1)??'',limit?.toFixed(0)??'',over?.toFixed(1)??'',status,typeof point.ignition==='boolean'?(point.ignition?'On':'Off'):'',finite(point.power_voltage)?point.power_voltage.toFixed(2):'',finite(point.tracker_battery_voltage)?point.tracker_battery_voltage.toFixed(2):'']);});
 }
 return '\ufeff'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
}

const ascii=(value:string)=>value.replace(/[–—]/g,'-').replace(/[^ -~]/g,' ');
const wrap=(value:string,font:PDFFont,size:number,width:number,maxLines=2)=>{const words=ascii(value).replace(/\s+/g,' ').trim().split(' '),lines:string[]=[];let line='';for(const word of words){const next=line?`${line} ${word}`:word;if(font.widthOfTextAtSize(next,size)<=width){line=next;continue;}if(line)lines.push(line);line=word;if(lines.length===maxLines-1)break;}if(line&&lines.length<maxLines)lines.push(line);const consumed=lines.join(' ').length,clean=words.join(' ');if(consumed<clean.length&&lines.length){let last=lines.length-1;while(lines[last]&&font.widthOfTextAtSize(`${lines[last]}...`,size)>width)lines[last]=lines[last].slice(0,-1);lines[last]=`${lines[last].trimEnd()}...`;}return lines;};
export async function tripHistoryPdf({machine,from,to,trips}:ExportInput){
 const doc=await PDFDocument.create(),regular=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);
 let watermark:PDFImage|undefined;if(typeof window!=='undefined')try{const response=await fetch('/assetcare-plus-sidebar.png');if(response.ok)watermark=await doc.embedPng(await response.arrayBuffer());}catch{}
 const pageSize:[number,number]=[841.89,595.28],margin=36,tableWidth=pageSize[0]-margin*2,rowHeight=42,columns=[82,202,202,70,68,70,75],headers=['STARTED','FROM','TO','DURATION','DISTANCE','MAX SPEED','SPEEDING'];let page=doc.addPage(pageSize),y=0;
 const navy=rgb(.025,.145,.205),cyan=rgb(.02,.52,.75),ink=rgb(.07,.14,.19),muted=rgb(.34,.41,.45),pale=rgb(.94,.97,.98),line=rgb(.78,.84,.87);
 const drawText=(text:string,x:number,at:number,size=8,font=regular,color=ink)=>page.drawText(ascii(text),{x,y:at,size,font,color});
 const drawWatermark=()=>{if(!watermark)return;const width=560,height=width*(watermark.height/watermark.width);page.drawImage(watermark,{x:(pageSize[0]-width)/2,y:(pageSize[1]-height)/2-30,width,height,opacity:.045});};
 const drawTableHeader=()=>{page.drawRectangle({x:margin,y:y-23,width:tableWidth,height:24,color:navy});let x=margin;headers.forEach((label,index)=>{drawText(label,x+6,y-15,6.7,bold,rgb(1,1,1));x+=columns[index];});y-=24;};
 const header=()=>{drawWatermark();page.drawRectangle({x:0,y:pageSize[1]-94,width:pageSize[0],height:94,color:navy});page.drawRectangle({x:0,y:pageSize[1]-5,width:pageSize[0],height:5,color:cyan});drawText('ASSETCARE+',margin,pageSize[1]-31,9,bold,rgb(.35,.82,1));drawText('JOURNEY HISTORY REPORT',margin,pageSize[1]-55,18,bold,rgb(1,1,1));drawText(machine,margin,pageSize[1]-76,11,bold,rgb(.9,.95,.97));const metaTop=pageSize[1]-116;drawText('REPORT PERIOD',margin,metaTop,6.5,bold,cyan);drawText(`${reportDate(from)} to ${reportDate(to)}`,margin,metaTop-13,9,bold);drawText('JOURNEYS',margin+265,metaTop,6.5,bold,cyan);drawText(String(trips.length),margin+265,metaTop-13,9,bold);drawText('GENERATED',margin+390,metaTop,6.5,bold,cyan);drawText(new Date().toLocaleString('en-GB'),margin+390,metaTop-13,9,bold);y=metaTop-35;drawTableHeader();};
 const newPage=()=>{page=doc.addPage(pageSize);header();};header();
 for(const [index,trip] of trips.entries()){
  if(y-rowHeight<38)newPage();if(index%2===1)page.drawRectangle({x:margin,y:y-rowHeight,width:tableWidth,height:rowHeight,color:pale,opacity:.93});
  const values=[clock(trip.started_at),place(trip.start_address),place(trip.end_address),duration(trip),`${miles(trip.distance)?.toFixed(2)??'-'} mi`,`${mph(maximumSpeed(trip))?.toFixed(1)??'-'} mph`,String(speedings(trip))];let x=margin;
  values.forEach((value,column)=>{const emphasized=column===6&&speedings(trip)>0,font=emphasized?bold:regular,color=emphasized?rgb(.78,.07,.12):ink;wrap(value,font,7,columns[column]-12,2).forEach((part,row)=>drawText(part,x+6,y-15-row*10,7,font,color));x+=columns[column];});
  page.drawLine({start:{x:margin,y:y-rowHeight},end:{x:margin+tableWidth,y:y-rowHeight},thickness:.45,color:line});y-=rowHeight;
 }
 const pages=doc.getPages();pages.forEach((item,index)=>{item.drawLine({start:{x:margin,y:27},end:{x:pageSize[0]-margin,y:27},thickness:.5,color:line});item.drawText('AssetCare+ | Relay fleet intelligence',{x:margin,y:14,size:6.5,font:regular,color:muted});item.drawText(`Page ${index+1} of ${pages.length}`,{x:pageSize[0]-margin-52,y:14,size:6.5,font:regular,color:muted});});
 return doc.save();
}
