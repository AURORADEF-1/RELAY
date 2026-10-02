'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getSupabaseAccessToken } from '@/lib/supabase';
import { boardSlide, type PlantBoardData } from '@/lib/plant-wallboard/model';
import './style.css';
const periodLabels = {today:'Today',week:'This week',month:'This month'};
const titles = ['Plant at a glance', 'Plant activity', 'Recent movements'];
const time = (v: string | number) => new Date(v).toLocaleTimeString('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit'});
const shortDate = (v: string | number) => new Date(v).toLocaleDateString('en-GB',{timeZone:'Europe/London',day:'numeric',month:'short'});
const duration = (h: number | null | undefined) => h == null ? '—' : h < 24 ? `${h.toFixed(1)}h` : `${(h/24).toFixed(1)}d`;
export function PlantWallboard() {
  const [data,setData] = useState<PlantBoardData|null>(null), [error,setError] = useState('');
  const [startedAt] = useState(()=>Date.now()), [now,setNow] = useState(()=>Date.now());
  const [paused,setPaused] = useState(false), [selected,setSelected] = useState(0), [full,setFull] = useState(false);
  const [displayMessage,setDisplayMessage] = useState('');
  const [heldPage,setHeldPage] = useState(0);
  const [period,setPeriod] = useState<'today'|'week'|'month'>('today');
  const slide = paused ? selected : boardSlide(startedAt,now);
  // Rotation depends only on the clock; background refreshes cannot reset it.
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
  useEffect(()=>{
    let active=true, timer:ReturnType<typeof setTimeout>|undefined;
    const controller=new AbortController();
    async function refresh() {
      try {
        const token=await getSupabaseAccessToken();
        if(!token){if(active)setData(null);throw new Error('Sign in again to view the plant wallboard.');}
        const response=await fetch('/api/plant/wallboard',{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:controller.signal});
        const result=await response.json();
        if(!response.ok){if(active&&(response.status===401||response.status===403))setData(null);throw new Error(result.error??'Unable to refresh plant figures.');}
        if(active){setData(result);setError('');}
      } catch(e) {if(active)setError(e instanceof Error?e.message:'Unable to refresh plant figures.');}
      finally {if(active)timer=setTimeout(()=>void refresh(),60000);}
    }
    void refresh();return()=>{active=false;controller.abort();if(timer)clearTimeout(timer);};
  },[]);
  useEffect(()=>{const sync=()=>setFull(!!document.fullscreenElement);document.addEventListener('fullscreenchange',sync);return()=>document.removeEventListener('fullscreenchange',sync);},[]);
  async function fullscreen() {try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();setDisplayMessage('');}catch{setDisplayMessage('Use your browser’s full-screen command to fill the display.');}}
  const stale=!!data&&now-Date.parse(data.checkedAt)>150000;
  const warning=error||(stale?'Refresh overdue — showing the last saved figures.':data?.warning)||'';
  const cycle=Math.floor(Math.max(0,now-startedAt)/75000);
  const recent=data?.recentByPeriod?.[period]??data?.recent??[], pages=Math.max(1,Math.ceil(recent.length/6)), recentPage=paused?heldPage%pages:cycle%pages, visible=recent.slice(recentPage*6,recentPage*6+6);
  return <main className="plant-board">
    <header className="plant-board-header"><div className="plant-brand">RELAY<span>PLANT</span></div><div className="plant-board-title"><p>Garboldisham · Director’s overview</p><h1>{titles[slide]}</h1></div><div className="plant-clock"><strong>{time(now)}</strong><span>{shortDate(now)} · UK time</span></div></header>
    <div className={`plant-update ${warning?'plant-update-warning':''}`} role="status"><span>{warning?'● ATTENTION':data?'● CONNECTED':'● CONNECTING'}</span><p>{warning|| (data?`${data.tracked} tracked plant assets · Updated ${time(data.checkedAt)} · Refreshes every minute`:'Loading saved plant records…')}</p></div>
    <div className="plant-period-selector" role="group" aria-label="Reporting period">{(['today','week','month'] as const).map((value,i)=><button key={value} aria-pressed={period===value} onClick={()=>{setPeriod(value);setHeldPage(0);}}>{['Daily','Weekly','Monthly'][i]}</button>)}<span>{data?`${shortDate(data.starts[period])} – ${shortDate(data.checkedAt)} · UK time`:''}</span></div>
    {!data ? <section className="plant-empty"><h2>{error?'Plant figures unavailable':'Loading plant overview'}</h2><p>{error||'Reading the latest saved positions and yard movements.'}</p>{error&&<Link href="/login?next=/plant-wallboard">Sign in</Link>}</section> : <>
      {slide===0&&<section className="plant-screen" aria-label="Plant at a glance">
        <div className="plant-location-cards"><Card label="Last reported outside yard" value={data.out} detail="Latest usable reported position" tone="blue"/><Card label="Last reported in yard" value={data.yard} detail="Latest usable reported position" tone="green"/><Card label="Location unclear" value={data.unknown} detail="Missing, conflicting or boundary evidence" tone="amber"/></div>
        <div className="plant-today"><div><p className="plant-eyebrow">{periodLabels[period].toUpperCase()} · UK CALENDAR PERIOD</p><h2>Yard movements</h2></div><div><span className="plant-arrow">↗</span><strong>{data[period].departures}</strong><span>Departures</span></div><div><span className="plant-arrow plant-return">↙</span><strong>{data[period].returns}</strong><span>Returns</span></div></div>
        <p className="plant-explainer">Totals use last-reported positions, including older or undated readings. Machines can move between reports. Yard location does not confirm hire or readiness.</p>
        <details className="plant-location-detail"><summary>Reading ages and quality · includes {data.lastKnown.yard} last-known in yard and {data.lastKnown.out} outside</summary><p>{data.locationReasons.stale} older than {data.recentMinutes} minutes · {data.locationReasons.undated} undated · {data.locationReasons.boundary} near boundary · {data.locationReasons.conflict} conflicting · {data.locationReasons.missing} missing/invalid</p></details>
      </section>}
      {slide===1&&<section className="plant-screen" aria-label="Plant activity">
        <div className="plant-periods plant-periods-single">{[period].map(period=><article className="plant-period" key={period}><header><h2>{periodLabels[period]}</h2><span>{shortDate(data.starts[period])} – {shortDate(data.checkedAt)}</span></header><div className="plant-period-counts"><div><strong>{data[period].departures}</strong><span>Departures ↗</span></div><div><strong>{data[period].returns}</strong><span>Returns ↙</span></div></div><div className="plant-turnaround"><div><span>Average yard turnaround</span><strong>{duration(data[period].turnaroundHours)}</strong></div><p>{data[period].matchedCycles?`${data[period].matchedCycles} matched return → next departure cycles`:'More return and departure history needed'}</p></div><div className="plant-redeployment"><strong>{data[period].redeploymentPercent===null?'—':`${Math.round(data[period].redeploymentPercent)}%`}</strong><p>of assets returned in this period have left again<br/><span>{data[period].redeployedAssets} of {data[period].returnedAssets} returned assets</span></p></div></article>)}</div>
        <p className="plant-explainer">Turnaround = time back in the yard before the next departure. Selected period is still in progress. Crossing times are the first clear GPS reports; gaps can delay detection.</p>
      </section>}
      {slide===2&&<section className="plant-screen" aria-label="Recent movements"><div className="plant-movement-heading"><h2>{periodLabels[period]} · movements newest first</h2><span>Page {recentPage+1} of {pages}</span></div><div className="plant-movement-grid">{visible.map(e=><article className={`plant-movement ${e.kind==='yard_arrival'?'is-return':''}`} key={e.id}><div className="plant-movement-icon">{e.kind==='yard_arrival'?'↙':'↗'}</div><div><p>{e.kind==='yard_arrival'?'RETURNED TO YARD':'LEFT THE YARD'}</p><h2>{e.label}</h2><span>{e.model||'Plant asset'}</span></div><time>{time(e.at)}<span>{shortDate(e.at)}</span></time></article>)}</div>{!visible.length&&<div className="plant-empty"><h2>No recorded movements in this period</h2><p>This is not proof of no activity. Check tracking and history coverage.</p></div>}</section>}
      <footer className="plant-board-footer"><p>GPS history · {data.historySince?`History from ${shortDate(data.historySince)}; earlier periods incomplete`:'Movement history not yet available'} · Tracked plant only</p><nav aria-label="Wallboard screens">{titles.map((title,i)=><button key={title} aria-label={title} aria-pressed={slide===i} onClick={()=>{setSelected(i);setHeldPage(recentPage);setPaused(true);}}>{i+1}</button>)}</nav></footer>
    </>}
    <div className="plant-board-controls"><Link href="/reports?tab=yard">Detailed report</Link><Link href="/console">Back to RELAY</Link><button onClick={()=>{setSelected(slide);setHeldPage(recentPage);setPaused(v=>!v);}}>{paused?'Resume rotation':'Pause rotation'}</button><button onClick={()=>void fullscreen()}>{full?'Exit full screen':'Full screen'}</button><span>{displayMessage||(paused?'Paused': 'Rotates every 25 seconds')}</span></div>
  </main>;
}
function Card({label,value,detail,tone}:{label:string;value:number;detail:string;tone:string}) {return <article className={`plant-card plant-${tone}`}><p>{label}</p><strong>{value}</strong><span>{detail}</span></article>;}
