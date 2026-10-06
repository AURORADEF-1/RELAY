'use client';
import {useEffect,useState} from 'react';
import {assetRequest} from './request';
import type {CardStatus} from '@/lib/assets/card-status';
import './fleet-status.css';
export function useFleetStatuses(version:unknown,enabled=true){
 const [result,setResult]=useState<{version:unknown;statuses:Record<string,CardStatus>}|null>(null);
 useEffect(()=>{if(!enabled)return;const c=new AbortController();const refresh=()=>{if(document.visibilityState==='hidden')return;void assetRequest<{statuses:Record<string,CardStatus>}>('/api/assets/status',c.signal).then(d=>{if(!c.signal.aborted)setResult({version,statuses:d.statuses});}).catch(()=>{if(!c.signal.aborted)setResult({version,statuses:{}});});};refresh();const timer=setInterval(refresh,60000);document.addEventListener('visibilitychange',refresh);return()=>{c.abort();clearInterval(timer);document.removeEventListener('visibilitychange',refresh);};},[version,enabled]);
 return enabled&&result&&result.version===version?result.statuses:{};
}
export function FleetStatus({status}:{status?:CardStatus}){if(!status||status.tone==='unknown')return null;const showPrimary=status.tone!=='running'&&status.tone!=='movement'&&status.tone!=='review';const showTransit=status.transit&&status.tone!=='transit';if(!showPrimary&&!showTransit)return null;return <>{showPrimary&&<span className={`fleet-status fleet-status-${status.tone}`} title={status.detail}>{status.label}</span>}{showTransit&&<span className="fleet-status fleet-status-transit">In transit</span>}{showPrimary&&<small>{status.detail}</small>}</>;}
export function FleetStatusLegend(){return <p className="fleet-status-legend"><span className="fleet-status fleet-status-fault">Red: recent fault</span><span className="fleet-status fleet-status-transit">Purple: in transit</span><span className="fleet-status fleet-status-unknown">Grey: stopped / not confirmed</span></p>;}
