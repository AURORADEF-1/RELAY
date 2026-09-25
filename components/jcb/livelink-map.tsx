"use client";
import {currentTransit} from '@/lib/assets/transit';
import {useEffect,useRef,useState} from 'react';
import L from 'leaflet';
import {locationViews} from '@/lib/fleet-map/location-views';
import {LocationViews} from '@/components/telematics/location-views';
import yard from '@/lib/fleet-operations/yard.json';
import 'leaflet/dist/leaflet.css';
import {machineKey,machineBrand,partsRequestUrl,positionAge,type LinkedJcbMachine} from '@/lib/integrations/jcb/types';
export default function LiveLinkMap({machines,selectedPin,onSelect,showYard=false,focusYard=false,labels=false,cluster=false,base='map',sidePanel=false}:{machines:LinkedJcbMachine[];selectedPin:string|null;onSelect:(pin:string)=>void;showYard?:boolean;focusYard?:boolean;labels?:boolean;cluster?:boolean;base?:'map'|'satellite';sidePanel?:boolean}){
 const container=useRef<HTMLDivElement>(null),map=useRef<L.Map|null>(null),fitted=useRef(false),lastSelection=useRef<string|null>(null),select=useRef(onSelect);
 const [tileError,setTileError]=useState(false),[expanded,setExpanded]=useState(false);
 const selected=machines.find(m=>machineKey(m)===selectedPin);
 useEffect(()=>{select.current=onSelect;},[onSelect]);
 useEffect(()=>{if(!container.current)return;const instance=L.map(container.current,{scrollWheelZoom:false}).setView([52.5,.9],8);map.current=instance;fitted.current=false;const observer=new ResizeObserver(()=>instance.invalidateSize());observer.observe(container.current);return()=>{observer.disconnect();instance.remove();map.current=null;};},[]);
 useEffect(()=>{
  const instance=map.current;if(!instance)return;const key=process.env.NEXT_PUBLIC_MAPTILER_KEY;
  const satellite=base==='satellite'&&!!key;
  const layer=L.tileLayer(satellite?`https://api.maptiler.com/maps/satellite-v4/{z}/{x}/{y}.jpg?key=${encodeURIComponent(key!)}`:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:satellite?'<a href="https://www.maptiler.com/copyright/">&copy; MapTiler</a> <a href="https://www.openstreetmap.org/copyright">&copy; OpenStreetMap contributors</a>':'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(instance);
  layer.on('tileerror',()=>setTileError(true));layer.on('load',()=>setTileError(false));return()=>{layer.remove();};
 },[base]);
 useEffect(()=>{const instance=map.current;if(!instance||!showYard)return;const polygon=L.polygon(yard.geometry.coordinates[0].map(([lon,lat])=>[lat,lon] as [number,number]),{color:'#19846d',weight:2,fillOpacity:.12}).addTo(instance).bindPopup('Garboldisham yard');return()=>{polygon.remove();};},[showYard]);
 function fit(){const instance=map.current;if(!instance)return;const bounds=L.latLngBounds([]);if(focusYard)yard.geometry.coordinates[0].forEach(([lon,lat])=>bounds.extend([lat,lon]));else machines.forEach(m=>{if(m.position)bounds.extend([m.position.latitude,m.position.longitude]);});if(bounds.isValid())instance.fitBounds(bounds,{padding:[40,40],maxZoom:focusYard?17:14});}
 useEffect(()=>{
  const instance=map.current;if(!instance)return;
  const valid=machines.filter(m=>m.position&&Number.isFinite(m.position.latitude)&&Math.abs(m.position.latitude)<=90&&Number.isFinite(m.position.longitude)&&Math.abs(m.position.longitude)<=180);
  if(!fitted.current&&valid.length){const bounds=L.latLngBounds([]);if(focusYard)yard.geometry.coordinates[0].forEach(([lon,lat])=>bounds.extend([lat,lon]));else valid.forEach(m=>bounds.extend([m.position!.latitude,m.position!.longitude]));instance.fitBounds(bounds,{padding:[40,40],maxZoom:focusYard?17:14});fitted.current=true;}
  const group=L.layerGroup().addTo(instance);
  // Open once for an explicit selection, never again during pan/zoom redraws.
  let openSelection=lastSelection.current!==selectedPin;
  function draw(){
   group.clearLayers();const bins=new Map<string,LinkedJcbMachine[]>(),zoom=instance!.getZoom();
   for(const m of valid){const p=m.position!,ll=L.latLng(p.latitude,p.longitude);if(!instance!.getBounds().pad(.2).contains(ll))continue;const px=instance!.project(ll,zoom);const key=cluster&&machineKey(m)!==selectedPin?`${Math.floor(px.x/54)}:${Math.floor(px.y/54)}`:machineKey(m);const bin=bins.get(key);if(bin)bin.push(m);else bins.set(key,[m]);}
   for(const members of bins.values()){
    if(members.length>1){const bounds=L.latLngBounds(members.map(m=>[m.position!.latitude,m.position!.longitude] as [number,number]));const marker=L.marker(bounds.getCenter(),{icon:L.divIcon({className:'fleet-map-cluster',html:`<span>${members.length}</span>`,iconSize:[44,44]}),title:`${members.length} assets — select to expand`}).addTo(group);
     const content=document.createElement('div');content.className='fleet-cluster-list';for(const m of members){const b=document.createElement('button');b.textContent=m.relay?.machine_number||m.equipmentId;b.onclick=()=>select.current(machineKey(m));content.append(b);}marker.bindPopup(content);marker.on('click',()=>{if(zoom<18)instance!.fitBounds(bounds,{maxZoom:zoom+2,padding:[40,40]});});continue;
    }
    const m=members[0],p=m.position!,name=m.relay?.machine_number||m.equipmentId||m.pin,age=p.at?Date.now()-Date.parse(p.at):NaN,old=!Number.isFinite(age)||age<0||age>86400000,transit=!!currentTransit(m);
    const icon=L.divIcon({className:'jcb-map-marker',html:`<span class="jcb-map-dot ${old?'jcb-map-dot-old':m.source==='assetcare'?'assetcare-map-dot':m.source==='takeuchi'?'takeuchi-map-dot':m.source==='trackunit'?'trackunit-map-dot':''}"></span>`,iconSize:[36,36],iconAnchor:[18,18]});
    const marker=L.marker([p.latitude,p.longitude],{icon,title:`${name}${transit?' · In transit':''} · ${old?'Not checked in':positionAge(p.at)}`}).addTo(group);
    const popup=document.createElement('div');popup.className='fleet-compact-popup';const title=document.createElement('strong');title.textContent=`${name} · ${machineBrand(m)} ${m.model}${transit?' · In transit':''}`;popup.append(title);
    const time=document.createElement('p');time.textContent=`${old?'Not checked in — last known position. ':''}Last position: ${p.at?new Date(p.at).toLocaleString():'time unavailable'}`;popup.append(time);
    const button=document.createElement('button');button.type='button';button.textContent='View machine';button.className='jcb-popup-button';button.onclick=()=>select.current(machineKey(m));const actions=document.createElement('div');actions.className='fleet-popup-actions';popup.append(actions);actions.append(button);
    for(const view of locationViews(p)){const a=document.createElement('a');a.href=view.href;a.textContent=`${view.label} ↗`;a.target='_blank';a.rel='noopener noreferrer';a.className='jcb-popup-button';actions.append(a);}
    const href=partsRequestUrl(m);if(href){const a=document.createElement('a');a.href=href;a.textContent='Parts request';a.className='jcb-popup-button';actions.append(a);}
    if(!sidePanel)marker.bindPopup(popup,{autoPan:false,maxWidth:300,minWidth:220});marker.on('click',()=>select.current(machineKey(m)));
    if(labels||showYard&&old){const label=document.createElement('span');label.textContent=`${name}${transit?' · In transit':''}${old?' · Not checked in':''}`;marker.bindTooltip(label,{permanent:true,direction:'top'});}
    if(!sidePanel&&openSelection&&machineKey(m)===selectedPin){openSelection=false;marker.openPopup();}
   }
  }
  draw();instance.on('moveend zoomend',draw);return()=>{instance.off('moveend zoomend',draw);group.remove();};
 },[machines,selectedPin,labels,cluster,showYard,focusYard,sidePanel]);
 useEffect(()=>{if(lastSelection.current===selectedPin)return;lastSelection.current=selectedPin;const m=machines.find(m=>machineKey(m)===selectedPin);if(m?.position)map.current?.panTo([m.position.latitude,m.position.longitude]);},[selectedPin,machines]); // preserve the user's map position on refresh
 return <><div className="jcb-actions" aria-label="Map views"><button className="jcb-button" onClick={fit}>Fleet overview</button><button className="jcb-button" onClick={()=>map.current?.fitBounds(L.latLngBounds(yard.geometry.coordinates[0].map(([lon,lat])=>[lat,lon] as [number,number])),{padding:[30,30],maxZoom:17})}>Yard view</button><button className="jcb-button" disabled={!selected?.position} onClick={()=>{if(selected?.position)map.current?.setView([selected.position.latitude,selected.position.longitude],17);}}>Selected machine</button>{!sidePanel&&<button className="jcb-button" aria-pressed={expanded} onClick={()=>setExpanded(v=>!v)}>{expanded?'Standard map':'Large map'}</button>}</div>{!sidePanel&&selected?.position&&<LocationViews position={selected.position}/>}{tileError&&<p role="status">Map imagery could not load. Asset readings remain available in the list.</p>}<div ref={container} className={`jcb-map${expanded&&!sidePanel?' jcb-map-expanded':''}`} aria-label="Fleet map. Select a pin or group to view assets."/></>;
}
