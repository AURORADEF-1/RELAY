'use client';
import {useEffect,useState} from 'react';
import {assetRequest} from './request';
import type {CardStatus} from '@/lib/assets/card-status';
import './fleet-status.css';
export function useFleetStatuses(version:unknown){
 const [result,setResult]=useState<{version:unknown;statuses:Record<string,CardStatus>}|null>(null);
 useEffect(()=>{const c=new AbortController();const refresh=()=>{if(document.visibilityState==='hidden')return;void assetRequest<{statuses:Record<string,CardStatus>}>('/api/assets/status',c.signal).then(d=>{if(!c.signal.aborted)setResult({version,statuses:d.statuses});}).catch(()=>{if(!c.signal.aborted)setResult({version,statuses:{}});});};refresh();const timer=setInterval(refresh,60000);document.addEventListener('visibilitychange',refresh);return()=>{c.abort();clearInterval(timer);document.removeEventListener('visibilitychange',refresh);};},[version]);
 return result&&result.version===version?result.statuses:{};
}
export function FleetStatus({status}:{status?:CardStatus}){return <><span className={`fleet-status fleet-status-${status?.tone??'unknown'}`} title={status?.detail}>{status?.label??'Status not yet checked'}</span>{status?.movement&&status.tone!=='movement'&&<span className="fleet-status fleet-status-movement">{status.movement} · last 24h</span>}<small>{status?.detail??'No current status assessment available.'}</small></>;}
export function FleetStatusLegend(){return <p className="fleet-status-legend"><span className="fleet-status fleet-status-fault">Red: recent fault</span><span className="fleet-status fleet-status-review">Amber: fault history</span><span className="fleet-status fleet-status-movement">Blue: movement in 24h</span><span className="fleet-status fleet-status-running">Green: running, no faults returned</span><span className="fleet-status fleet-status-unknown">Grey: stopped / not confirmed</span></p>;}
