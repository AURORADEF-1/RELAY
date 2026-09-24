"use client";
import {Suspense,useState} from 'react';
import {useSearchParams} from 'next/navigation';
import Link from 'next/link';
import {HealthReport} from '@/components/jcb/health-report';
import './style.css';
export function FleetHealthReports(){return <Suspense fallback={<p>Loading Fleet Health…</p>}><Reports/></Suspense>;}
function Reports(){const params=useSearchParams();const [selection,setProvider]=useState<'jcb'|'trackunit'|null>(null);const provider=selection??(params.get('provider')==='trackunit'?'trackunit':'jcb');return <><div className="tracking-health-switch"><button className="fh-button" aria-pressed={provider==='jcb'} onClick={()=>setProvider('jcb')}>JCB Fleet Health</button><button className="fh-button" aria-pressed={provider==='trackunit'} onClick={()=>setProvider('trackunit')}>Manitou Fleet Health</button><Link className="fh-button fh-outline" href="/fleet/map">Combined fleet map</Link></div><HealthReport key={provider} provider={provider}/></>;}
