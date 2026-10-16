import type {TripPoint} from './workspace';

export type SpeedingSeverity='amber'|'red'|null;
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);

export function speedingSeverity(reading:Pick<TripPoint,'speeding'|'speed_kph'|'speed_limit_kph'>):SpeedingSeverity{
 if(!reading.speeding)return null;
 if(!finite(reading.speed_kph)||!finite(reading.speed_limit_kph)||reading.speed_limit_kph<=0)return'red';
 return reading.speed_kph<=reading.speed_limit_kph*1.1?'amber':'red';
}
