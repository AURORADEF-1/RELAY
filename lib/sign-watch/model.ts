export type SignWatchReading={status:string;calibrated:boolean;calibrated_at:string|null;sensor_age_ms:number;tilt_deg:number|null;pitch_deg:number|null;roll_deg:number|null;cone?:number[];gps:{fix:boolean;latitude:number|null;longitude:number|null;satellites:number;age_ms:number|null}};
export type SignWatchFeed={stale:boolean;latest:{received_at:string;payload:SignWatchReading}|null};
const names:Record<string,string>={uncalibrated:'Not calibrated',level:'Upright',tilted:'Upright',fallen:'Knocked over',moving:'Upright',offline:'Sensor offline',sensor_error:'Sensor error'};
export function signWatchState(feed:SignWatchFeed|null,now=Date.now(),failed=false){
 const reading=feed?.latest?.payload;
 const stamp=Date.parse(feed?.latest?.received_at??'');
 const stale=failed||!Number.isFinite(stamp)||now-stamp>20000||!!feed?.stale;
 const live=!stale&&!!reading&&Number.isFinite(reading.sensor_age_ms)&&reading.sensor_age_ms<1500&&!['offline','sensor_error'].includes(reading.status);
 const calibrated=live&&reading?.calibrated===true;
 const finite=(n:number|null|undefined)=>typeof n==='number'&&Number.isFinite(n)?n:null;
 const location=live&&reading?.gps.fix&&reading.gps.age_ms!==null&&reading.gps.age_ms<10000&&finite(reading.gps.latitude)!==null&&finite(reading.gps.longitude)!==null?{latitude:reading.gps.latitude!,longitude:reading.gps.longitude!}:null;
 return {reading,stale,live,calibrated,location,label:stale?'Feed offline':names[reading?.status??'']??'Unknown',tilt:calibrated?finite(reading?.tilt_deg):null,pitch:calibrated?finite(reading?.pitch_deg):null,roll:calibrated?finite(reading?.roll_deg):null};
}
