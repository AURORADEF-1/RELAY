import {assetCareReadings} from './readings';
import type {LinkedJcbMachine,RegistryMachine} from '../jcb/types';
type ObjectValue=Record<string,unknown>;
const object=(v:unknown):ObjectValue=>v&&typeof v==='object'&&!Array.isArray(v)?v as ObjectValue:{};
const text=(v:unknown)=>typeof v==='string'?v:'';
const number=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v:null;
const numeric=(v:unknown)=>{if(typeof v==='number'&&Number.isFinite(v))return v;if(typeof v==='string'&&v.trim()&&Number.isFinite(Number(v)))return Number(v);return null;};
const voltageKey=(value:string)=>['voltage','batteryvoltage','powervoltage','externalvoltage','externalpowervoltage','mainvoltage','mainpowervoltage','supplyvoltage','inputvoltage','vehiclevoltage'].includes(value.replace(/[^a-z]/gi,'').toLowerCase());
function suppliedVoltage(value:unknown,depth=0):number|null{
 if(!value||typeof value!=='object'||depth>4)return null;
 if(Array.isArray(value)){for(const item of value){const found=suppliedVoltage(item,depth+1);if(found!==null)return found;}return null;}
 const row=value as ObjectValue,label=[row.name,row.label,row.type,row.description].find(v=>typeof v==='string') as string|undefined;
 if(label&&/\b(?:battery|power|supply|input|vehicle|external|main)?\s*voltage\b/i.test(label))for(const key of ['value','reading','state','number']){const found=numeric(row[key]);if(found!==null)return found;}
 for(const [key,item] of Object.entries(row)){if(voltageKey(key)){const direct=numeric(item);if(direct!==null)return direct;const nested=suppliedVoltage(item,depth+1);if(nested!==null)return nested;}}
 for(const item of Object.values(row)){const found=suppliedVoltage(item,depth+1);if(found!==null)return found;}
 return null;
}
export type AssetCareSnapshot={asset_id:string;observed_at:string;name:string;machine:LinkedJcbMachine};
export function normalizeAssetCare(record:unknown,ownerId:string,now=Date.now()):AssetCareSnapshot|null{
 let row=object(record);
 if(text(object(row.owner).id)!==ownerId)return null;
 if(row.type==='event')row=object(object(row.details).telemetry);
 if(row.type!=='telemetry'&&row.type!=='trip')return null;
 if(text(object(row.owner).id)!==ownerId)return null;
 const trip=row.type==='trip',asset=object(row.asset),id=text(asset.id),name=text(asset.name),at=text(trip?row.dateEnd:row.date);
 if(!id||!at||!Number.isFinite(Date.parse(at))||Date.parse(at)>now+300000)return null;
 const location=object(trip?row.end:row.location),lat=number(location.lat),lon=number(location.lon);
 // A positive GPS age is not a new fix. Its unit is not documented, so retain
 // the coordinate but mark its age unknown instead of inventing a fresh time.
 const positionAt=!trip&&number(location.age)!==null&&Number(location.age)>0?null:at;
 const valid=lat!==null&&lon!==null&&Math.abs(lat)<=90&&Math.abs(lon)<=180&&(lat!==0||lon!==0);
 const hours=number(object(row.counters).hours),telemetry=object(row.telemetry),ignition=telemetry.ignition;
 const odo=number(object(row.counters).odometer)??number(telemetry.odometer);
 const voltage=suppliedVoltage([telemetry,row.io,row.counters]);
 const speed=number(location.speed),heading=number(location.heading),gc=object(location.gc);
 const road=(text(gc.rt)||text(gc.rd)).trim().slice(0,160)||null;
 const travel=!trip&&valid?{heading:heading!==null&&heading>=0&&heading<=360?heading%360:null,speedMph:speed!==null&&speed>=0&&speed<=240?speed/1.609344:null,road,at:positionAt}:null;
 const off=ignition===0||ignition===false,on=ignition===1||ignition===true;
 return {asset_id:id,observed_at:at,name,machine:{assetcareReadings:assetCareReadings(row,id,ownerId),source:'assetcare',pin:id,equipmentId:name||id,model:text(object(row.assetType).name),travel,position:valid?{latitude:lat,longitude:lon,at:positionAt}:null,hours:hours!==null&&hours>=0?{value:hours,at}:null,ignition:!trip&&(off||on)?{value:on,at}:null,odometer:!trip&&odo!==null&&odo>=0?{value:odo,at}:null,batteryVoltage:voltage!==null&&voltage>=0&&voltage<=100?{value:voltage,at}:null,engine:null,idleHours:null,fuel:null,adblue:null,relay:null,match:'unmatched'}};
}
export function linkAssetCare(machine:LinkedJcbMachine,registry:RegistryMachine[]):LinkedJcbMachine{
 // Accept an explicit numeric fleet prefix only, never a partial/driver-name match.
 const name=machine.equipmentId.trim(),fleetNumber=/^(\d{4,6})\s+[-–—]\s+\S/.exec(name)?.[1];
 const candidates=registry.filter(r=>r.machine_number.trim().toUpperCase()===name.toUpperCase()||!!fleetNumber&&r.machine_number.trim()===fleetNumber||!!r.serial_number&&r.serial_number===machine.pin);
 const relay=candidates.length===1?candidates[0]:null;
 // The register owns machine identity; provider type labels such as Vehicle
 // are not the machine model. Keep the original provider snapshot untouched.
 return {...machine,model:relay?.model?.trim()||machine.model,relay,match:relay?'exact':candidates.length>1?'ambiguous':'unmatched'};
}
export function combineFleet(machines:LinkedJcbMachine[]){
 const result:LinkedJcbMachine[]=[],seen=new Set<string>();
 // Prefer the established manufacturer feed when both are linked to one asset.
 for(const m of [...machines.filter(m=>m.source!=='assetcare'),...machines.filter(m=>m.source==='assetcare')]){
  const key=m.relay?`relay:${m.relay.id}`:`${m.source}:${m.pin}`;
  if(!seen.has(key)){seen.add(key);const secondary=m.relay?machines.find(a=>a.source==='assetcare'&&a.relay?.id===m.relay!.id):null;result.push(secondary?{...m,lastReportedAt:m.lastReportedAt??secondary.lastReportedAt,hours:m.hours??secondary.hours,ignition:m.ignition??secondary.ignition,odometer:m.odometer??secondary.odometer,transit:secondary.transit??m.transit,travel:m.travel??secondary.travel,batteryVoltage:m.batteryVoltage??secondary.batteryVoltage,position:m.position?{...m.position,address:m.position.address??secondary.position?.address}:secondary.position}:m);}
 }
 return result;
}
