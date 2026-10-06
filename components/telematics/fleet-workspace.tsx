"use client";
import {useAssetFlags,FlagMachine,FlaggedList} from '@/components/assets/flags';
import {flagForMachine} from '@/lib/assets/flags';
import {AssetTravel} from '@/components/assets/travel-summary';
import {CollectionHealth} from './collection-health';
import {ShareAssetLocation} from '@/components/assets/share-location';
import {LocationViews} from '@/components/telematics/location-views';
import {MapPreferences} from './map-preferences';
import {defaults,readPreferences,filterFleet,type Preferences} from '@/lib/fleet-map/preferences';
import {costCentreColour} from '@/lib/fleet-map/cost-centre-colours';
import dynamic from "next/dynamic";
import {useFleetStatuses,FleetStatus} from "@/components/assets/fleet-status";
import Link from "next/link";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {getSupabaseAccessToken} from "@/lib/supabase";
import {machineKey,machineBrand,machineProvider,machineLastReportedAt,partsRequestUrl,positionAge,titleCaseAssetLabel,titleCaseAssetText,type LinkedJcbMachine,type JcbFault,type RegistryMachine} from "@/lib/integrations/jcb/types";
import {lastKnownSide} from '@/lib/plant-wallboard/positions';
import {FaultCards} from "@/components/jcb/fault-cards";
import type {Telemetry} from "@/lib/integrations/trackunit/normalize";
import "@/app/livelink/style.css";
import "@/components/jcb/health.css";
import "./style.css";
const FleetMap=dynamic(()=>import("@/components/jcb/livelink-map"),{ssr:false,loading:()=> <p>Loading fleet map…</p>});
type Source={provider:string;available:boolean;count:number;checkedAt:string|null;stale:boolean};
type Fleet={groupError?:boolean;machines:LinkedJcbMachine[];admin:boolean;checkedAt?:string;stale?:boolean;sources?:Source[];assetcareStatus?:{last_attempt_at:string|null;last_ack_at:string|null;last_error:string|null;last_cycle?:{drained:boolean;latestReceivedAt?:string|null;batches:number;records:number}}|null};
type Details={machine:LinkedJcbMachine;faults:JcbFault[];checkedAt:string;faultError?:boolean;telemetryError?:boolean;telemetry?:Telemetry[]};
async function api<T>(provider:string,path:string,signal?:AbortSignal,body?:unknown):Promise<T>{
 const token=await getSupabaseAccessToken();if(!token)throw new Error('Sign in to view fleet tracking.');
 const endpoint=`/api/integrations/${provider}/${path}`;
 const response=await fetch(endpoint,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal});
 const data=await response.json();if(!response.ok)throw new Error(data.error||'Fleet connection unavailable. Please retry.');return data;
}
const date=(at?:string|null)=>at?new Date(at).toLocaleString('en-GB'):'Time unavailable';
const lastCheckIn=(at?:string|null)=>at?`Last check-in: ${new Date(at).toLocaleString('en-GB',{timeZone:'Europe/London',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'})}`:'Last check-in unavailable';
const coordinateKey=(machine:LinkedJcbMachine)=>machine.position?`${machine.position.latitude.toFixed(5)},${machine.position.longitude.toFixed(5)}`:null;
const currentLocation=(machine:LinkedJcbMachine,resolved?:string|null)=>lastKnownSide(machine,Date.now())==='off_hire'?'MLP Yard':machine.position?.address?.trim()||machine.travel?.road?.trim()||resolved||(machine.position?'Check Map':'Position Unavailable');
const nearbyAddress=(machine:LinkedJcbMachine,machines:LinkedJcbMachine[])=>{
 if(!machine.position)return null;
 const lat=machine.position.latitude*Math.PI/180,metresPerLongitude=111320*Math.cos(lat);
 let nearest:{distance:number;address:string}|null=null;
 for(const candidate of machines){
  if(candidate===machine||!candidate.position)continue;
  const address=candidate.position.address?.trim()||candidate.travel?.road?.trim();if(!address)continue;
  const north=(candidate.position.latitude-machine.position.latitude)*111320;
  const east=(candidate.position.longitude-machine.position.longitude)*metresPerLongitude;
  const distance=Math.hypot(north,east);
  if(distance<=150&&(!nearest||distance<nearest.distance))nearest={distance,address};
 }
 return nearest?.address??null;
};
const batteryVoltage=(machine:LinkedJcbMachine)=>machine.batteryVoltage?`${machine.batteryVoltage.value.toFixed(2).replace(/\.00$/,'')} V`:'Not Supplied';
const machineTitle=(machine:LinkedJcbMachine)=>machine.source==='assetcare'&&!machine.relay?titleCaseAssetLabel(machine.equipmentId):`${machine.relay?.machine_number||machine.equipmentId} · ${titleCaseAssetText(`${machineBrand(machine)}${machine.model?` ${machine.model}`:''}`)}`;
const costCentres=['Hydraulic Services','Non Shared','Operators','Plant','Plant Office','Stock','Transport','Workshop','Yard'];
function CostCentreAssignment({machine,onSaved}:{machine:LinkedJcbMachine;onSaved:()=>void}){
 const [costCentre,setCostCentre]=useState(''),[saving,setSaving]=useState(false),[error,setError]=useState('');
 async function save(){if(!costCentre)return;setSaving(true);setError('');try{const token=await getSupabaseAccessToken();if(!token)throw new Error('Sign in required.');const response=await fetch('/api/assets/cost-centre',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({label:machine.equipmentId,costCentre})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Unable to save cost centre.');onSaved();}catch(e){setError(e instanceof Error?e.message:'Unable to save cost centre.');}finally{setSaving(false);}}
 return <div className="fleet-cost-centre" onClick={e=>e.stopPropagation()}><select aria-label={`Cost centre for ${machine.equipmentId}`} value={costCentre} onChange={e=>setCostCentre(e.target.value)}><option value="">Choose cost centre</option>{costCentres.map(option=><option key={option}>{option}</option>)}</select><button type="button" disabled={!costCentre||saving} onClick={()=>void save()}>{saving?'Saving…':'Save'}</button>{error&&<small role="alert">{error}</small>}</div>;
}
export function TrackingWorkspace({combined=false,request=api,provider="trackunit"}:{combined?:boolean;request?:typeof api;provider?:"trackunit"|"takeuchi"}){
 const [fleet,setFleet]=useState<Fleet|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[version,setVersion]=useState(0);
 const [query,setQuery]=useState(''),[view,setView]=useState(combined?'split':'map'),[selected,setSelected]=useState<string|null>(null);
 const [details,setDetails]=useState<{key:string;data:Details}|null>(null),[detailError,setDetailError]=useState('');
 const [registry,setRegistry]=useState<RegistryMachine[]|null>(null),[mapping,setMapping]=useState(''),[notice,setNotice]=useState(''),[saving,setSaving]=useState(false);
 const [preferences,setPreferences]=useState<Preferences>(defaults),[page,setPage]=useState(0);
 const [resolvedAddresses,setResolvedAddresses]=useState<Record<string,string|null>>({});
 const attemptedAddresses=useRef(new Set<string>());
 useEffect(()=>{const id=setTimeout(()=>{try{const saved=localStorage.getItem('relay:fleet-map:v3')??localStorage.getItem('relay:fleet-map:v2');setPreferences({...readPreferences(saved),freshness:'all',labels:true,providers:[...defaults.providers]});}catch{}},0);return()=>clearTimeout(id);},[]);
 function updatePreferences(p:Preferences){const next={...p,freshness:'all' as const,labels:true,providers:[...defaults.providers]};setPreferences(next);setPage(0);try{localStorage.setItem('relay:fleet-map:v3',JSON.stringify(next));}catch{}}
 useEffect(()=>{if(!combined)return;const openAsset=()=>{if(window.location.hash==='#signwatch:sign-watch-test'){setSelected('signwatch:sign-watch-test');setPreferences({...defaults,labels:true});setQuery('');setView('map');}};openAsset();window.addEventListener('hashchange',openAsset);return()=>window.removeEventListener('hashchange',openAsset);},[combined]);
 const panel=useRef<HTMLElement>(null),mapShell=useRef<HTMLDivElement>(null),fullScreenButton=useRef<HTMLButtonElement>(null);
 const [fullScreen,setFullScreen]=useState(false);
 useEffect(()=>{
  if(!fullScreen)return;
  const previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
  const shell=mapShell.current,trigger=fullScreenButton.current;shell?.focus();
  function keydown(e:KeyboardEvent){
   if(e.key==='Escape'){e.preventDefault();setFullScreen(false);if(combined)setView('split');}
   if(e.key==='Tab'&&shell){const nodes=Array.from(shell.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input,select,textarea,[tabindex="0"]')).filter(n=>n.getClientRects().length);const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===shell)){e.preventDefault();last?.focus();}else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===shell)){e.preventDefault();first?.focus();}}
  }
  document.addEventListener('keydown',keydown);
  return()=>{document.body.style.overflow=previousOverflow;document.removeEventListener('keydown',keydown);trigger?.focus();};
 },[fullScreen,combined]);
 const statuses=useFleetStatuses(`${combined}:${provider}:${version}`,!!fleet&&(!combined||fleet.admin));
 useEffect(()=>{const c=new AbortController();setLoading(true);setError('');void request<Fleet>(combined?'combined':provider,'fleet',c.signal).then(d=>{if(!c.signal.aborted)setFleet(d);}).catch(e=>{if(!c.signal.aborted)setError(e.message);}).finally(()=>{if(!c.signal.aborted)setLoading(false);});return()=>c.abort();},[combined,provider,version,request]);
 const flagState=useAssetFlags(!!fleet?.admin);
 const allMachines=useMemo(()=>fleet?.machines??[],[fleet]);
 const flaggedKeys=useMemo(()=>allMachines.filter(m=>flagForMachine(flagState.flags,m)).map(machineKey),[allMachines,flagState.flags]);
 const unmatched=useMemo(()=>allMachines.filter(m=>m.assetGroup==='Unmatched'),[allMachines]);
 const machines=useMemo(()=>{
  const filtered=filterFleet(allMachines,combined?{...preferences,status:fleet?.admin?preferences.status:'all'}:{...preferences,providers:[provider],brand:'all',category:'all',group:[]},query,statuses);
  if(!combined||preferences.group.length>0)return filtered;
  return [...filtered].sort((a,b)=>{
   const aTime=Date.parse(machineLastReportedAt(a)??''),bTime=Date.parse(machineLastReportedAt(b)??'');
   if(Number.isFinite(aTime)!==Number.isFinite(bTime))return Number.isFinite(bTime)?1:-1;
   if(Number.isFinite(aTime)&&aTime!==bTime)return bTime-aTime;
   return machineTitle(a).localeCompare(machineTitle(b),undefined,{numeric:true,sensitivity:'base'});
  });
 },[allMachines,query,preferences,combined,provider,statuses,fleet?.admin]);
 const shownPage=Math.min(page,Math.max(0,Math.ceil(machines.length/60)-1));
 const previousShownPage=useRef(shownPage);
 useEffect(()=>{if(previousShownPage.current===shownPage)return;previousShownPage.current=shownPage;const list=mapShell.current?.querySelector<HTMLElement>('.jcb-machine-list');if(list)list.scrollTop=0;},[shownPage]);
 useEffect(()=>{
  const attempted=attemptedAddresses.current;
  const missing=new Map<string,{latitude:number;longitude:number}>();
  for(const machine of machines){const key=coordinateKey(machine);if(key&&machine.position&&!machine.position.address?.trim()&&!machine.travel?.road?.trim()&&!(key in resolvedAddresses)&&!attempted.has(key))missing.set(key,{latitude:machine.position.latitude,longitude:machine.position.longitude});}
  if(!missing.size)return;
  const entries=[...missing.entries()];for(const [key] of entries)attempted.add(key);
  const controller=new AbortController();
  void (async()=>{try{
   const token=await getSupabaseAccessToken();if(!token)return;
   const found:Record<string,string|null>={};
   for(let index=0;index<entries.length;index+=50){
    const batch=entries.slice(index,index+50);
    const points=batch.map(([,point])=>`${point.longitude},${point.latitude}`).join(';');
    const response=await fetch(`/api/maps/reverse-geocode?${new URLSearchParams({points})}`,{headers:{Authorization:`Bearer ${token}`},signal:controller.signal});
    if(!response.ok)continue;
    const data=await response.json() as {addresses?:Array<string|null>};
    batch.forEach(([key],offset)=>{found[key]=data.addresses?.[offset]??null;});
   }
   if(!controller.signal.aborted)setResolvedAddresses(current=>({...current,...found}));
  }catch(error){if(!(error instanceof DOMException&&error.name==='AbortError'))return;}})();
  return()=>{controller.abort();for(const [key] of entries)attempted.delete(key);};
 },[machines,resolvedAddresses]);
 const machine=allMachines.find(m=>machineKey(m)===selected);
 const choose=useCallback((key:string)=>{setSelected(key);setMapping('');setNotice('');},[]);
 useEffect(()=>{if(!fullScreen&&selected&&window.innerWidth<=1000)panel.current?.scrollIntoView({behavior:'smooth',block:'start'});},[selected,fullScreen]);
 useEffect(()=>{if(!machine||(combined&&!fleet?.admin))return;const c=new AbortController();setDetailError('');void request<Details>(machine.source??'jcb',`machine?${new URLSearchParams({pin:machine.pin})}`,c.signal).then(data=>{if(!c.signal.aborted)setDetails({key:machineKey(machine),data});}).catch(e=>{if(!c.signal.aborted)setDetailError(e.message);});return()=>c.abort();},[machine,version,request,combined,fleet?.admin]);
 const current=combined&&!fleet?.admin?null:details?.key===selected?details.data:null;
 const display=current?.machine??machine;
 const href=display?partsRequestUrl(display):null;
 const sourceSummary=fleet?.admin?<footer className="fleet-source-footer">{fleet.assetcareStatus&&<p className={fleet.assetcareStatus.last_error?'jcb-warning':'jcb-sync'}>Asset Care+ collection: last attempted {date(fleet.assetcareStatus.last_attempt_at)} · last saved and acknowledged {date(fleet.assetcareStatus.last_ack_at)}. {fleet.assetcareStatus.last_error} {(!fleet.assetcareStatus.last_ack_at||Date.now()-Date.parse(fleet.assetcareStatus.last_ack_at)>86400000)&&'Check collection: the export can disable after seven days without use.'}</p>}{fleet.assetcareStatus&&<CollectionHealth state={fleet.assetcareStatus}/>}<div className="tracking-sources">{(fleet.sources??[{provider,available:true,count:fleet.machines.length,checkedAt:fleet.checkedAt??null,stale:!!fleet.stale}]).map(s=><div className={!s.available||s.stale?'jcb-warning':'jcb-sync'} key={s.provider}><strong>{s.provider==='assetcare'?'Asset Care+':s.provider==='takeuchi'?'Takeuchi Track':s.provider==='jcb'?'JCB LiveLink':'Manitou Track'}</strong> · {s.available?`${s.count} machines · fetched ${date(s.checkedAt)}`:'Connection unavailable — this fleet is missing from the map'}{s.stale&&s.available?' · Cached data is out of date':''}</div>)}</div><p className="jcb-sync">Readings are cached for up to 15 minutes. Check the position timestamp before travelling. Map pins: teal JCB, red Manitou, purple Takeuchi, blue Asset Care+ and amber for a position not checked in. Card colours show the status below.</p></footer>:null;
 async function openLinking(){try{const result=await request<{registry:RegistryMachine[]}>(machine?.source??provider,'manage');setRegistry(result.registry);}catch(e){setNotice(e instanceof Error?e.message:'Unable to load linking.');}}
 async function link(){if(!machine||!mapping)return;setSaving(true);try{await request(machine.source??provider,'manage',undefined,{action:'mapping',pin:machine.pin,machineId:mapping});setNotice('Machine link saved.');setRegistry(null);setVersion(v=>v+1);}catch(e){setNotice(e instanceof Error?e.message:'Unable to link machine.');}finally{setSaving(false);}}
 function exportCsv(){if(!fleet?.admin)return;const cell=(x:unknown)=>'"'+String(x??'').replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')+'"';const rows:unknown[][]=[['Provider','RELAY machine','Fleet number','Machine reference','Model','Latitude','Longitude','Position reported','Address / road','Operating hours','Battery voltage','Ignition','Odometer (km)','Speed (mph)','Heading','Make','Group','Asset type']];for(const m of machines)rows.push([machineProvider(m),m.relay?.machine_number,m.equipmentId,m.pin,m.model,m.position?.latitude,m.position?.longitude,m.position?.at,m.position?.address??m.travel?.road,m.hours?.value,m.batteryVoltage?.value,m.ignition?.value===true?'On':m.ignition?.value===false?'Off':'',m.odometer?.value,m.travel?.speedMph,m.travel?.heading,machineBrand(m),m.assetGroup,m.assetCategory]);const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='RELAY-fleet-positions.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 return <div className={`jcb-workspace${combined?' fleet-workspace-combined':''}`}>{!combined&&<header className="jcb-toolbar"><div><h1>{provider==='takeuchi'?'Takeuchi Track':'Manitou Track'}</h1><p>Machine positions, dated faults and RELAY parts requests.</p></div><div className="jcb-actions"><button disabled={loading} onClick={()=>setVersion(v=>v+1)}>{loading?'Loading…':'Refresh View'}</button>{fleet?.admin&&<><button onClick={exportCsv}>Export Positions CSV</button><Link className="jcb-button" href="/reports?tab=fleet">Fleet Health</Link></>}{fleet&&<Link className="jcb-button" href="/fleet/register">Fleet Register</Link>}</div></header>}
 {!fleet&&loading&&<FleetLoadingAnimation combined={combined}/>} 
 {error&&<p role="alert" className="jcb-warning">{error} {fleet?'Showing previously loaded data.':''}</p>}
 {fleet?.admin&&flagState.error&&!flagState.error.includes('storage is not configured')&&<p role="alert" className="jcb-warning">{flagState.error} <button onClick={flagState.refresh}>Retry flags</button></p>}
 {notice&&<p role="status" className="jcb-notice">{notice}</p>}
 {fleet&&<>
 <div className="jcb-toolbar fleet-view-toolbar"><label className="jcb-search">Find a machine<input placeholder="Fleet number, model, registration or PIN" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}/></label><div className="jcb-actions">{combined&&<><button disabled={loading} onClick={()=>setVersion(v=>v+1)}>Refresh View</button>{fleet.admin&&<><button onClick={exportCsv}>Export Positions CSV</button><Link className="jcb-button" href="/reports?tab=fleet">Fleet Health</Link><Link className="jcb-button" href="/fleet/trips">Trip History</Link></>}<Link className="jcb-button" href="/fleet/register">Fleet Register</Link><button aria-pressed={view==='split'} onClick={()=>setView('split')}>Register + Map</button></>}{!combined&&<><button aria-pressed={view==='map'} onClick={()=>setView('map')}>Map only</button><button aria-pressed={view==='list'} onClick={()=>setView('list')}>Register only</button>{fleet.admin&&!flagState.error&&<button aria-pressed={view==='flagged'} onClick={()=>{setView('flagged');setFullScreen(false);}}>⚑ Flagged ({flagState.ready?flagState.flags.length:'…'})</button>}</>}</div></div>
 {fleet.groupError&&<p role="status" className="jcb-warning">Asset groups could not be loaded. Refresh to retry.</p>}
 {fleet.admin&&unmatched.length>0&&<p role="status" className="jcb-warning"><strong>{unmatched.length} tracked asset{unmatched.length===1?' needs':'s need'} a cost centre.</strong> <button onClick={()=>{updatePreferences({...preferences,group:['Unmatched']});setView('list');setFullScreen(false);}}>Review unmatched assets</button></p>}
 {view==='flagged'&&fleet.admin?<FlaggedList flags={flagState.flags} machines={allMachines} query={query} ready={flagState.ready} onRefresh={flagState.refresh} onSelect={key=>{setQuery('');setPreferences(p=>({...defaults,base:p.base,cluster:p.cluster,labels:p.labels,yard:p.yard}));choose(key);setView(combined?'split':'map');}}/>:<div className={`fleet-control-room${combined?' fleet-control-room-combined':''}`}>{combined&&<aside className="fleet-filter-rail"><MapPreferences value={preferences} onChange={updatePreferences} machines={allMachines}/></aside>}<div ref={mapShell} tabIndex={-1} role={fullScreen?'dialog':undefined} aria-modal={fullScreen||undefined} aria-label={fullScreen?'Full screen fleet map':undefined} className={`fleet-map-shell${fullScreen?' fleet-map-fullscreen':''}${selected?' fleet-map-has-selection':''}${combined&&view==='map'?' fleet-map-focused':''}${combined&&view==='split'?' fleet-map-split':''}`}>
 {view==='map'&&<div className="fleet-fullscreen-toolbar"><strong>{fullScreen?'Fleet map':''}</strong>{fullScreen&&<label>Find machine<input aria-label="Find machine in full screen" placeholder="Fleet number, model or PIN" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}/></label>}<button ref={fullScreenButton} onClick={()=>{if(fullScreen){setFullScreen(false);if(combined)setView('split');}else setFullScreen(true);}}>{fullScreen?'Exit full screen':'Full screen map'}</button></div>}
 <div className="jcb-grid"><section className="jcb-results" aria-label="Tracked machines">{(view==='map'||view==='split')&&<FleetMap machines={machines} selectedPin={selected} onSelect={choose} onFullScreen={combined&&view==='split'?()=>{setView('map');setFullScreen(true);}:undefined} onClusterChange={combined?cluster=>updatePreferences({...preferences,cluster}):undefined} showYard={preferences.yard} labels cluster={preferences.cluster} base={preferences.base} sidePanel={fullScreen||combined} flaggedKeys={flaggedKeys}/>}{(view==='list'||view==='split')&&<>{machines.length>60&&<nav className="jcb-actions fleet-pagination-top" aria-label="Asset pages at top"><button disabled={shownPage===0} onClick={()=>setPage(shownPage-1)}>Previous</button><span>Page {shownPage+1} of {Math.ceil(machines.length/60)}</span><button disabled={(shownPage+1)*60>=machines.length} onClick={()=>setPage(shownPage+1)}>Next</button></nav>}<div className="jcb-machine-list">{machines.slice(shownPage*60,shownPage*60+60).map(m=><article className={`jcb-machine fleet-card-${statuses[machineKey(m)]?.tone??'unknown'} ${selected===machineKey(m)?'selected':''}`} style={{borderLeftColor:costCentreColour(m.assetGroup)}} key={machineKey(m)}><button type="button" className="fleet-machine-select" aria-pressed={selected===machineKey(m)} onClick={()=>choose(machineKey(m))}><strong>{machineTitle(m)}</strong>{fleet.admin&&flagForMachine(flagState.flags,m)&&<span className="fleet-flag-badge">⚑ Flagged</span>}{fleet.admin&&m.assetGroup==='Unmatched'&&<span className="fleet-flag-badge">⚠ Cost centre required</span>}{(!combined||fleet.admin)&&<FleetStatus status={statuses[machineKey(m)]}/>}<span className="fleet-current-location">Current location: {currentLocation(m,nearbyAddress(m,fleet.machines)||(coordinateKey(m)?resolvedAddresses[coordinateKey(m)!]:null))}</span><span className="fleet-last-reported">{lastCheckIn(machineLastReportedAt(m))}</span><span className="fleet-battery-voltage"><small>Battery voltage</small><b>{batteryVoltage(m)}</b></span></button>{fleet.admin&&m.assetGroup==='Unmatched'&&<CostCentreAssignment machine={m} onSaved={()=>setVersion(v=>v+1)}/>}</article>)}{!machines.length&&<p>No machines match this filter.</p>}</div>{machines.length>60&&<nav className="jcb-actions fleet-pagination-bottom" aria-label="Asset pages at bottom"><button disabled={shownPage===0} onClick={()=>setPage(shownPage-1)}>Previous</button><span>Page {shownPage+1} of {Math.ceil(machines.length/60)}</span><button disabled={(shownPage+1)*60>=machines.length} onClick={()=>setPage(shownPage+1)}>Next</button></nav>}</>}</section>
 <section ref={panel} className="jcb-detail" aria-label="Selected machine">{(fullScreen||combined)&&<button className="fleet-close-detail" aria-label="Close machine details" title="Close machine details" onClick={()=>setSelected(null)}>×</button>}{!display?<><h2>Select a machine</h2><p>Choose a map pin or machine to see its position and faults, or raise a parts request.</p></>:<><h2>{machineTitle(display)}</h2><p>{display.model}</p>{display.relay&&(!combined||fleet.admin)&&<Link className="jcb-button" href={`/assets/${display.relay.id}`}>Machine record</Link>}{(!combined||fleet.admin)&&<FleetStatus status={statuses[machineKey(display)]}/>} {fleet.admin&&<FlagMachine key={`${machineKey(display)}:${flagForMachine(flagState.flags,display)?.id??'none'}`} machine={display} flag={flagForMachine(flagState.flags,display)} ready={flagState.ready} onSaved={flagState.refresh}/>}{fleet.admin&&<AssetTravel key={machineKey(display)} machine={display}/>}<h3>Last-known position</h3>{display.position?<><p>{date(display.position.at)} · {positionAge(display.position.at)}</p><a className="jcb-button" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${display.position.latitude},${display.position.longitude}`}>Directions to this position</a><LocationViews position={display.position}/>{fleet.admin&&<ShareAssetLocation key={`${display.source}:${display.pin}`} machine={display}/>}</>:<p>No valid position supplied.</p>}
 {href?<Link className="jcb-button jcb-primary" href={href}>Raise RELAY parts request</Link>:<p className="jcb-warning">An admin must confirm the RELAY machine link before a request can be prefilled.</p>}
 {fleet.admin&&(display.source==='trackunit'||display.source==='takeuchi')&&<button className="jcb-button" onClick={()=>void openLinking()}>Confirm / change RELAY link</button>}
 {registry&&(display.source==='trackunit'||display.source==='takeuchi')&&<div className="tracking-link"><p>Verify the full machine reference against the RELAY record before saving.</p><label>RELAY machine<select value={mapping} onChange={e=>setMapping(e.target.value)}><option value="">Select verified machine</option>{registry.filter(r=>(r.make??'').toUpperCase().startsWith(machine?.source==='takeuchi'?'TAKEUCHI':'MANITOU')).map(r=><option key={r.id} value={r.id}>{r.machine_number} · {r.model} · {r.serial_number||'No serial'}</option>)}</select></label><button disabled={!mapping||saving} onClick={()=>void link()}>Save verified link</button><button onClick={()=>setRegistry(null)}>Cancel</button></div>}
 {combined&&!fleet.admin?<p className="jcb-sync">Directions use the last-known position shown above. Check its reported time before travelling.</p>:detailError?<p role="alert" className="jcb-warning">{detailError}</p>:!current?<p>Loading machine readings…</p>:<>{fleet.admin&&<><h3>Reported Condition</h3><dl className="jcb-metrics"><div><dt>Operating Hours</dt><dd>{display.hours?`${display.hours.value.toFixed(1)} h`:'Not Supplied'}</dd><small>{display.hours?date(display.hours.at):''}</small></div><div><dt>Battery Voltage</dt><dd>{display.batteryVoltage?`${display.batteryVoltage.value.toFixed(2).replace(/\.00$/,'')} V`:'Not Supplied'}</dd><small>{display.batteryVoltage?date(display.batteryVoltage.at):''}</small></div><div><dt>Ignition</dt><dd>{display.ignition?display.ignition.value?'On':'Off':'Not Supplied'}</dd><small>{display.ignition?date(display.ignition.at):''}</small></div><div><dt>Odometer</dt><dd>{display.odometer?`${display.odometer.value.toLocaleString('en-GB')} km`:'Not Supplied'}</dd><small>{display.odometer?date(display.odometer.at):''}</small></div><div><dt>Speed</dt><dd>{display.travel?.speedMph!=null?`${display.travel.speedMph.toFixed(1)} mph`:'Not Supplied'}</dd><small>{display.travel?date(display.travel.at):''}</small></div><div><dt>Heading</dt><dd>{display.travel?.heading!=null?`${Math.round(display.travel.heading)}°`:'Not Supplied'}</dd><small>{display.travel?.road||''}</small></div><div><dt>Fuel</dt><dd>{display.fuel?`${display.fuel.value}%`:'Not Supplied'}</dd><small>{display.fuel?date(display.fuel.at):''}</small></div><div><dt>AdBlue</dt><dd>{display.adblue?`${display.adblue.value}%`:'Not Supplied'}</dd><small>{display.adblue?date(display.adblue.at):''}</small></div></dl>{current.telemetryError&&<p className="jcb-warning">Telemetry unavailable. These readings have not been assessed.</p>}{current.telemetry&&<details className="tracking-readings"><summary>All reported readings ({current.telemetry.length})</summary><p>Provider readings with their original units and times. Confirm warning states on the machine.</p>{current.telemetry.map((t,i)=><div key={`${t.name}-${i}`}><strong>{t.name}</strong><span>{String(t.value??'Not supplied')} {t.uoM}</span><small>{date(t.time)}</small></div>)}</details>}</>}{current.faultError?<p className="jcb-warning">{display.source==='assetcare'?'Asset Care+ fault-code coverage is not confirmed. Do not treat this as an all-clear.':'Fault records unavailable. Retry before assessing this machine.'}</p>:<FaultCards machine={display} faults={current.faults} checkedAt={current.checkedAt}/>}</>}
 </>}</section></div></div></div>}{sourceSummary}</>}
 </div>;
}

function FleetLoadingAnimation({combined}:{combined:boolean}){
 return <section className="fleet-loading-screen" role="status" aria-live="polite" aria-label="Loading live fleet data">
  <div className="fleet-loading-map" aria-hidden="true">
   <div className="fleet-loading-grid"/>
   <div className="fleet-loading-radar"><span/></div>
   <i className="fleet-loading-pin pin-one"/><i className="fleet-loading-pin pin-two"/><i className="fleet-loading-pin pin-three"/><i className="fleet-loading-pin pin-four"/>
   <div className="fleet-loading-mark"><span><svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 7v26M7 20h26"/></svg></span></div>
  </div>
  <div className="fleet-loading-copy">
   <span className="fleet-loading-kicker">ASSETCARE+ LIVE TRACKING</span>
   <strong>{combined?'Building Your Fleet Map':'Connecting to Machine Tracking'}</strong>
   <p>Securely connecting to live providers and plotting the latest known positions.</p>
   <div className="fleet-loading-progress"><span/></div>
   <div className="fleet-loading-steps"><span>Authenticating</span><span>Loading assets</span><span>Plotting positions</span></div>
  </div>
 </section>;
}
