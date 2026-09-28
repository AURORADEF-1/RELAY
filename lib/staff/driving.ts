import type {StaffRow} from './model';
export type DrivingSort='alerts'|'excess'|'speed'|'name';
export function drivingLeague(rows:StaffRow[],department='',query='',alertsOnly=false,sort:DrivingSort='alerts'){
 const filtered=rows.filter(r=>(!department||r.department===department)&&`${r.label} ${r.department}`.toLowerCase().includes(query.trim().toLowerCase())&&(!alertsOnly||r.daily.available&&r.daily.speedingCount>0));
 const metric=(r:StaffRow)=>!r.daily.available?-1:sort==='speed'?r.daily.peakSpeedKph??-1:sort==='excess'?r.daily.maxExcessKph??-1:r.daily.speedingCount;
 const ranked=[...filtered].sort((a,b)=>sort==='name'?a.label.localeCompare(b.label):metric(b)-metric(a)||a.label.localeCompare(b.label));
 return ranked.map(r=>({...r,rank:r.daily.available&&r.daily.speedingCount>0?1+filtered.filter(other=>other.daily.available&&other.daily.speedingCount>r.daily.speedingCount).length:null}));
}
export function mph(kph:number|null){return kph===null?'Not supplied':`${(kph/1.609344).toFixed(1)} mph`;}
