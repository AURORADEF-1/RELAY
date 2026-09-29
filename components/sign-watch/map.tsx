'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {useState} from 'react';
import {useSignWatch} from './use-sign-watch';
import '@/app/livelink/style.css';
import '@/components/telematics/style.css';
const FleetMap=dynamic(()=>import('@/components/jcb/livelink-map'),{ssr:false});
export function SignWatchMap(){const {state,machine,error}=useSignWatch(),[selected,setSelected]=useState<string|null>(null);return <section><div className="jcb-toolbar"><div><h2>Test</h2><p role="status">{state.label}{state.tilt!==null?` · Tilt ${state.tilt.toFixed(1)}°`:''}</p></div><Link className="jcb-button" href="/assets/inbox?kind=sign_watch">Fleet inbox</Link></div>{error&&<p role="alert">{error}</p>}{!state.location&&<p>No fresh GPS location available. The Test pin will appear when GPS readings resume.</p>}<FleetMap machines={machine?[machine]:[]} selectedPin={selected} onSelect={setSelected} labels/><p>Knock-over alerts and a follow-up after 60 seconds appear in the Fleet inbox. No movement pop-ups or sounds.</p></section>;}
