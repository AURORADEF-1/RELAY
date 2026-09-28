'use client';
import {useEffect,useState} from 'react';
import type {LinkedJcbMachine} from '@/lib/integrations/jcb/types';
import {travelSummary,type TravelSummary} from '@/lib/assets/travel';
import {assetRequest} from './request';
export function AssetTravel({machine}:{machine:LinkedJcbMachine}){
 const key=`${machine.source??'jcb'}:${machine.pin}`;
 const [result,setResult]=useState<{key:string;summary:TravelSummary}|null>(null);
 useEffect(()=>{const controller=new AbortController();const load=()=>void assetRequest<TravelSummary>(`/api/assets/travel?${new URLSearchParams({provider:machine.source??'jcb',pin:machine.pin})}`,controller.signal).then(summary=>{if(!controller.signal.aborted)setResult({key,summary});}).catch(()=>{if(!controller.signal.aborted)setResult(null);});load();const timer=setInterval(load,60000);return()=>{controller.abort();clearInterval(timer);};},[key,machine.pin,machine.source]);
 const summary=result?.key===key?result.summary:travelSummary(machine);
 return <section aria-label="Travel status"><h3>Travel</h3><p><strong>{summary.text}</strong></p><small>{summary.at?`GPS report: ${new Date(summary.at).toLocaleString('en-GB',{timeZone:'Europe/London'})}`:'GPS report time unavailable'} · Vehicle telemetry, not a live position.{summary.estimated?' Direction shows displacement; it does not identify the road driven.':''}</small></section>;
}
