"use client";
import {Suspense,useState} from 'react';
import {useSearchParams} from 'next/navigation';
import Link from 'next/link';
import {HealthReport} from '@/components/jcb/health-report';
import './style.css';
export function FleetHealthReports(){return <Suspense fallback={<p>Loading Fleet Health…</p>}><Reports/></Suspense>;}
function Reports(){const params=useSearchParams();const [selection,setProvider]=useState<'jcb'|'trackunit'|'takeuchi'|null>(null);const provider=selection??(params.get('provider')==='takeuchi'?'takeuchi':params.get('provider')==='trackunit'?'trackunit':'jcb');return <><div className="tracking-health-switch"><Link className="fh-button" href="/fleet/operations">Fleet Operations &amp; Error Codes</Link><button className="fh-button" aria-pressed={provider==='jcb'} onClick={()=>setProvider('jcb')}>JCB Fleet Health</button><button className="fh-button" aria-pressed={provider==='trackunit'} onClick={()=>setProvider('trackunit')}>Manitou Fleet Health</button><button className="fh-button" aria-pressed={provider==='takeuchi'} onClick={()=>setProvider('takeuchi')}>Takeuchi Fleet Health</button><Link className="fh-button fh-outline" href="/fleet/map">Combined fleet map</Link></div><HealthReport key={provider} provider={provider}/></>;}
