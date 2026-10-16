'use client';
import {useState} from 'react';
import type {Trip,TripPoint} from './workspace';

type Sample={at:string;value:number;speeding?:boolean};

const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const miles=(kilometres:number|null)=>finite(kilometres)?`${(kilometres/1.609344).toFixed(2)} mi`:'Not supplied';
const clock=(value:string|null)=>value?new Date(value).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}):'—';
const tripDuration=(trip:Trip)=>{if(!trip.started_at)return 'Not supplied';const minutes=Math.round((Date.parse(trip.ended_at)-Date.parse(trip.started_at))/60000);if(!Number.isFinite(minutes)||minutes<0)return 'Not supplied';return minutes>=60?`${Math.floor(minutes/60)} h ${minutes%60} min`:`${minutes} min`;};
const speedSamples=(points:TripPoint[]):Sample[]=>points.flatMap(point=>finite(point.speed_kph)?[{at:point.at,value:point.speed_kph/1.609344,speeding:point.speeding}]:[]);
const voltageSamples=(points:TripPoint[],field:'power_voltage'|'tracker_battery_voltage'):Sample[]=>points.flatMap(point=>finite(point[field])?[{at:point.at,value:point[field]}]:[]);

function MiniChart({title,samples,unit,decimals=1,highlightSpeeding=false,hideWhenEmpty=false}:{title:string;samples:Sample[];unit:string;decimals?:number;highlightSpeeding?:boolean;hideWhenEmpty?:boolean}){
 const [hovered,setHovered]=useState<string|null>(null),[selected,setSelected]=useState<string|null>(null);
 if(hideWhenEmpty&&!samples.length)return null;
 if(!samples.length)return <section className="trip-telemetry-card trip-chart"><header><strong>{title}</strong></header><div className="trip-chart-empty">No readings supplied</div></section>;
 const values=samples.map(sample=>sample.value),rawMin=Math.min(...values),rawMax=Math.max(...values),padding=Math.max((rawMax-rawMin)*.12,.2),min=Math.max(0,rawMin-padding),max=rawMax+padding,range=max-min||1;
 const coords=samples.map((sample,index)=>({x:samples.length===1?120:6+(index/(samples.length-1))*228,y:78-((sample.value-min)/range)*68,...sample}));
 const line=coords.map((point,index)=>`${index?'L':'M'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' '),area=`${line} L${coords.at(-1)?.x.toFixed(1)} 78 L${coords[0].x.toFixed(1)} 78 Z`;
 const speeding=coords.filter(point=>point.speeding).map((point,index)=>({...point,key:`${point.at}-${index}`})),active=speeding.find(point=>point.key===(hovered??selected));
 return <section className="trip-telemetry-card trip-chart"><header><strong>{title}</strong><span>{rawMin.toFixed(decimals)}–{rawMax.toFixed(decimals)} {unit}</span></header><div className="trip-chart-plot"><svg viewBox="0 0 240 84" preserveAspectRatio="none" role="img" aria-label={`${title}, from ${rawMin.toFixed(decimals)} to ${rawMax.toFixed(decimals)} ${unit}`}><path className="trip-chart-grid" d="M5 20H235M5 49H235M5 78H235"/><path className="trip-chart-area" d={area}/><path className="trip-chart-line" d={line}/>{highlightSpeeding&&speeding.map(point=><circle key={point.key} tabIndex={0} role="button" aria-label={`Speeding at ${clock(point.at)}, ${point.value.toFixed(1)} mph`} className="trip-chart-speeding" cx={point.x} cy={point.y} r="3.2" onMouseEnter={()=>setHovered(point.key)} onMouseLeave={()=>setHovered(null)} onFocus={()=>setHovered(point.key)} onBlur={()=>setHovered(null)} onClick={()=>setSelected(value=>value===point.key?null:point.key)}/>)}</svg>{active&&<span className="trip-chart-tooltip" style={{left:`${(active.x/240)*100}%`,top:`${(active.y/84)*100}%`}}><b>{active.value.toFixed(1)} mph</b><small>{clock(active.at)}</small></span>}</div><footer><span>{clock(samples[0].at)}</span><span>{clock(samples.at(-1)?.at??null)}</span></footer></section>;
}

export function TripTelemetryPanel({trip}:{trip:Trip}){
 const speeds=speedSamples(trip.route_points),average=speeds.length?speeds.reduce((total,sample)=>total+sample.value,0)/speeds.length:null,maximum=speeds.length?Math.max(...speeds.map(sample=>sample.value)):finite(trip.speed_kph)?trip.speed_kph/1.609344:null;
 return <section className="trip-telemetry" aria-label="Journey telemetry"><section className="trip-telemetry-card trip-statistics"><header><strong>Statistics</strong></header><dl><div><dt>Start time</dt><dd>{clock(trip.started_at)}</dd></div><div><dt>End time</dt><dd>{trip.in_progress?'Live':clock(trip.ended_at)}</dd></div><div><dt>Distance</dt><dd>{miles(trip.distance)}</dd></div><div><dt>Duration</dt><dd>{tripDuration(trip)}</dd></div><div><dt>Average speed</dt><dd>{finite(average)?`${average.toFixed(1)} mph`:'Not supplied'}</dd></div><div><dt>Maximum speed</dt><dd>{finite(maximum)?`${maximum.toFixed(1)} mph`:'Not supplied'}</dd></div></dl></section><MiniChart title="Speed" samples={speeds} unit="mph" highlightSpeeding/><MiniChart title="Power voltage" samples={voltageSamples(trip.route_points,'power_voltage')} unit="V" decimals={2} hideWhenEmpty/><MiniChart title="Tracker battery" samples={voltageSamples(trip.route_points,'tracker_battery_voltage')} unit="V" decimals={2} hideWhenEmpty/></section>;
}
