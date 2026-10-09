import Link from 'next/link';
import {machineBrand,partsRequestUrl,type LinkedJcbMachine} from '@/lib/integrations/jcb/types';
import {LocationViews} from '@/components/telematics/location-views';
export function RoamMapDetails({machine:m}:{machine:LinkedJcbMachine}){
 const href=partsRequestUrl(m);
 return <><h2>{m.relay?.machine_number||m.equipmentId} · {machineBrand(m)}</h2><p>{m.model}</p><strong>On hire · ROAM</strong><p>{m.roamHire?.site||'Site not named'}</p><p className="jcb-warning">No live GPS. This pin is the {m.roamHire?.locationType==='delivery'?'recorded delivery':'ROAM site'} location, not a tracker reading. A matching tracker with a valid position reported within 24 hours takes priority.</p><Link className="jcb-button" href={`/fleet/hires/${encodeURIComponent(m.roamHire?.id??m.pin)}`}>View ROAM hire · {m.roamHire?.reference}</Link>{m.relay&&<Link className="jcb-button" href={`/assets/${m.relay.id}`}>Machine record</Link>}{m.position?<><h3>Hire location</h3><LocationViews position={m.position}/></>:<p>No usable site or delivery coordinates supplied by ROAM. This asset is listed but cannot be placed on the map.</p>}{href&&<Link className="jcb-button" href={href}>Raise AssetCare+ parts request</Link>}</>;
}
