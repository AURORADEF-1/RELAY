'use client';
import Link from 'next/link';
import {useEffect,useMemo,useState} from 'react';
import {buildFleetOverview} from '@/lib/assets/overview';
import type {LinkedJcbMachine} from '@/lib/integrations/jcb/types';
import {assetRequest} from './request';

type FleetResponse={machines:LinkedJcbMachine[];checkedAt?:string;stale?:boolean};
const date=(value?:string)=>value?new Date(value).toLocaleString('en-GB',{timeZone:'Europe/London'}):'Time unavailable';

export function AssetOverviewDashboard(){
 const [data,setData]=useState<FleetResponse|null>(null),[error,setError]=useState('');
 useEffect(()=>{const controller=new AbortController();assetRequest<FleetResponse>('/api/test-fleet',controller.signal).then(result=>{if(!controller.signal.aborted)setData(result);}).catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'Fleet overview unavailable.');});return()=>controller.abort();},[]);
 const overview=useMemo(()=>data?buildFleetOverview(data.machines):null,[data]);
 return <section className="asset-overview-dashboard" aria-labelledby="fleet-overview-title">
  <header className="asset-overview-heading"><div><p className="asset-eyebrow">Fleet &amp; Assets</p><h1 id="fleet-overview-title">Overview</h1><p>Latest known fleet position and tracker coverage.</p></div><div className="asset-overview-actions"><Link href="/fleet/map">Open Fleet Map</Link><Link href="/assets/inbox">View Alerts</Link></div></header>
  {error&&<p className="asset-overview-warning" role="alert">{error}</p>}
  {!overview?<p className="asset-overview-loading" role="status">Loading fleet overview…</p>:<>
   <div className="asset-overview-metrics" aria-label="Fleet location summary">
    <article className="is-total"><span>Tracked Assets</span><strong>{overview.total}</strong><small>Across all connected providers</small></article>
    <article className="is-yard"><span>Inside MLP Yard</span><strong>{overview.inside}</strong><small>Latest valid position is inside the geofence</small></article>
    <article className="is-away"><span>Outside MLP Yard</span><strong>{overview.outside}</strong><small>Latest valid position is outside the geofence</small></article>
   </div>
   <div className="asset-overview-panels">
    <article><header><div><p className="asset-eyebrow">Tracker Coverage</p><h2>Latest Check-In</h2></div><span>{data?.stale?'Cached data':'Live snapshot'}</span></header><div className="asset-checkin-bars"><div><span>Within 24 hours</span><strong>{overview.checkedIn24h}</strong><i style={{width:`${overview.total?overview.checkedIn24h/overview.total*100:0}%`}}/></div><div><span>Over 24 hours</span><strong>{overview.over24h}</strong><i style={{width:`${overview.total?overview.over24h/overview.total*100:0}%`}}/></div><div><span>No check-in time</span><strong>{overview.neverCheckedIn}</strong><i style={{width:`${overview.total?overview.neverCheckedIn/overview.total*100:0}%`}}/></div></div><small>Snapshot updated {date(data?.checkedAt)}</small></article>
    <article><header><div><p className="asset-eyebrow">Cost Centres</p><h2>Location Breakdown</h2></div><Link href="/fleet/map">View on Map</Link></header><div className="asset-overview-table"><table><thead><tr><th>Group</th><th>Total</th><th>Yard</th><th>Outside</th></tr></thead><tbody>{overview.groups.map(group=><tr key={group.name}><td>{group.name}</td><td>{group.total}</td><td>{group.inside}</td><td>{group.outside}</td></tr>)}</tbody></table></div></article>
   </div>
   <p className="asset-overview-note">Inside and outside figures use each asset’s latest valid saved GPS position against the MLP Yard geofence. They show last-known location, not contractual hire status or current movement.</p>
  </>}
 </section>;
}
