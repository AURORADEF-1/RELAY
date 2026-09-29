import Link from 'next/link';
import {LocationViews} from '@/components/telematics/location-views';
import type {useSignWatch} from './use-sign-watch';
export function SignWatchAssetDetails({sensor}:{sensor:ReturnType<typeof useSignWatch>}){
 const {state,feed,machine,error}=sensor;
 const angle=(v:number|null)=>v===null?'Unavailable':`${v.toFixed(1)}°`;
 return <><h2>Test · Sign Watch</h2><p>Tracked asset · Sign Watch</p><p role="status"><strong>{state.label}</strong></p>{error&&<p role="alert">{error}</p>}
 <dl><dt>Tilt from upright</dt><dd>{angle(state.tilt)}</dd><dt>Forward / back</dt><dd>{angle(state.pitch)}</dd><dt>Left / right</dt><dd>{angle(state.roll)}</dd><dt>Last received</dt><dd>{feed?.latest?new Date(feed.latest.received_at).toLocaleString('en-GB'):'Waiting for readings'}</dd><dt>Calibration</dt><dd>{state.reading?.calibrated?'Upright reference saved':'Not calibrated'}</dd></dl>
 <h3>Location</h3>{machine?.position?<><p>{machine.position.latitude.toFixed(6)}, {machine.position.longitude.toFixed(6)}</p><LocationViews position={machine.position}/></>:<p>No fresh GPS position available.</p>}
 <Link className="jcb-button" href="/assets/inbox?kind=sign_watch">View Fleet inbox alerts</Link><p className="jcb-sync">Knock-over alerts and the 60-second follow-up are recorded in the Fleet inbox.</p></>;
}
