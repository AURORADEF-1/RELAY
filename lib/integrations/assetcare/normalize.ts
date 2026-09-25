import type {LinkedJcbMachine,RegistryMachine} from '../jcb/types';
type ObjectValue=Record<string,unknown>;
const object=(v:unknown):ObjectValue=>v&&typeof v==='object'&&!Array.isArray(v)?v as ObjectValue:{};
const text=(v:unknown)=>typeof v==='string'?v:'';
const number=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v:null;
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
 const off=ignition===0||ignition===false,on=ignition===1||ignition===true;
 return {asset_id:id,observed_at:at,name,machine:{source:'assetcare',pin:id,equipmentId:name||id,model:text(object(row.assetType).name),position:valid?{latitude:lat,longitude:lon,at:positionAt}:null,hours:hours!==null&&hours>=0?{value:hours,at}:null,ignition:!trip&&(off||on)?{value:on,at}:null,odometer:!trip&&odo!==null&&odo>=0?{value:odo,at}:null,engine:null,idleHours:null,fuel:null,adblue:null,relay:null,match:'unmatched'}};
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
  if(!seen.has(key)){seen.add(key);const secondary=m.relay?machines.find(a=>a.source==='assetcare'&&a.relay?.id===m.relay!.id):null;result.push(secondary?.transit?{...m,transit:secondary.transit}:m);}
 }
 return result;
}
