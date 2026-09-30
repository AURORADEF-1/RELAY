import type {Telemetry} from '../trackunit/normalize';
const obj=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const names:Record<string,string>={power_voltage:'External supply voltage',battery_voltage:'Tracker battery voltage',battery_current:'Tracker battery current',ignition:'Ignition',moving:'Moving',movement:'Movement sensor',gsm_signal:'GSM signal',gnss_status:'GNSS status',sleep:'Sleep status',idle_counter:'Idle counter',hours_00_counter:'Engine hours counter',pdop:'GPS PDOP',hdop:'GPS HDOP',accuracy:'GPS accuracy',speed:'Speed',heading:'Heading',odometer:'Odometer',hours:'Operating hours',age:'GPS age',lat:'Latitude',lon:'Longitude',altitude:'Altitude'};
const units:Record<string,string>={power_voltage:'V',battery_voltage:'V',hours:'h',hours_00_counter:'h',heading:'°',speed:'km/h',lat:'°',lon:'°',accuracy:'m'};
export function assetCareReadings(record:unknown,assetId:string,ownerId:string):Telemetry[]{
 let r=obj(record);if(obj(r.owner).id!==ownerId)return [];if(r.type==='event')r=obj(obj(r.details).telemetry);
 if(r.type!=='telemetry'||obj(r.owner).id!==ownerId||obj(r.asset).id!==assetId||typeof r.date!=='string'||!Number.isFinite(Date.parse(r.date)))return [];
 const result:Telemetry[]=[];
 for(const [group,values] of [['Telemetry',r.telemetry],['Counters',r.counters],['GPS',r.location]] as const){
  for(const [key,value] of Object.entries(obj(values))){
   if(!['number','boolean','string'].includes(typeof value)||typeof value==='number'&&!Number.isFinite(value))continue;
   if(typeof value==='string'&&value.length>300)continue;
   const bool=['ignition','moving','movement'].includes(key)&&(value===0||value===1||typeof value==='boolean');
   result.push({name:`${group} · ${names[key]??key.replaceAll('_',' ')}`,value:bool?(value?'On':'Off'):value as string|number|boolean,time:r.date,uoM:bool?'':units[key]??(typeof value==='number'?'raw · unit/scale unconfirmed':'')});
  }
 }
 for(const [key,v] of Object.entries(obj(r.io))){const io=obj(v);if(typeof io.value!=='number'&&typeof io.value!=='string'&&typeof io.value!=='boolean')continue;result.push({name:`Sensor · ${typeof io.name==='string'?io.name:key}`,value:io.value,time:r.date,uoM:typeof io.unit==='string'?io.unit:'unit not supplied'});}
 if(typeof r.received==='string')result.push({name:'Provider received at',value:r.received,time:r.date,uoM:''});
 return result;
}
