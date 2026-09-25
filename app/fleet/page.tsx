"use client";
import {Suspense,useEffect,useState} from 'react';
import {useRouter,useSearchParams} from 'next/navigation';
import {AuthGuard} from '@/components/auth-guard';
import {getCurrentUserWithRole} from '@/lib/profile-access';
import {getSupabaseClient} from '@/lib/supabase';
function FleetLanding(){const router=useRouter(),params=useSearchParams(),[error,setError]=useState('');useEffect(()=>{let active=true;void Promise.resolve().then(()=>{const client=getSupabaseClient();if(!client)throw new Error('Unavailable');return getCurrentUserWithRole(client);}).then(({isAdmin})=>{if(active){const query=params.toString();router.replace(isAdmin&&!params.has('machine')?'/fleet/map':`/fleet/register${query?'?'+query:''}`);}}).catch(()=>{if(active)setError('Unable to open Fleet. Refresh to retry.');});return()=>{active=false;};},[router,params]);return <p role="status">{error||'Opening Fleet…'}</p>;}
export default function FleetPage(){return <AuthGuard><Suspense fallback={<p>Opening Fleet…</p>}><FleetLanding/></Suspense></AuthGuard>;}
