'use client';
import {useEffect,useRef} from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type {Trip} from './workspace';

export default function TripMap({trips,selected}:{trips:Trip[];selected:string|null}){
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(!ref.current)return;const map=L.map(ref.current,{scrollWheelZoom:true}).setView([52.5,.9],7);L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors'}).addTo(map);const bounds=L.latLngBounds([]);for(const trip of trips){const points:L.LatLngTuple[]=[];if(valid(trip.start_latitude,trip.start_longitude))points.push([trip.start_latitude!,trip.start_longitude!]);if(valid(trip.end_latitude,trip.end_longitude))points.push([trip.end_latitude!,trip.end_longitude!]);if(!points.length)continue;points.forEach(p=>bounds.extend(p));const active=trip.id===selected;if(points.length===2)L.polyline(points,{color:active?'#ef4444':'#1688c9',weight:active?6:3,opacity:active?1:.5}).addTo(map);L.circleMarker(points[0],{radius:active?7:5,color:'#1688c9',fillOpacity:1}).bindPopup(`${trip.asset_name} · trip start`).addTo(map);if(points.length>1)L.circleMarker(points[1],{radius:active?7:5,color:'#ef4444',fillOpacity:1}).bindPopup(`${trip.asset_name} · trip end`).addTo(map);}if(bounds.isValid())map.fitBounds(bounds,{padding:[32,32],maxZoom:15});const observer=new ResizeObserver(()=>map.invalidateSize());observer.observe(ref.current);return()=>{observer.disconnect();map.remove();};},[trips,selected]);return <div ref={ref} className="trip-map" aria-label="Recorded AssetCare trip routes"/>;
}
function valid(lat:number|null,lon:number|null){return lat!==null&&lon!==null&&Math.abs(lat)<=90&&Math.abs(lon)<=180&&(lat!==0||lon!==0);}
