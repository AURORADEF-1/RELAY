import type {LinkedJcbMachine} from '@/lib/integrations/jcb/types';
import type {RoamHire} from './hires';
const str=(v:unknown)=>typeof v==='string'?v.trim():'';
const fleetKey=(v:unknown)=>str(v).toUpperCase().replace(/[^A-Z0-9]/g,'');
function coords(lat:unknown,lon:unknown){
 const a=typeof lat==='number'?lat:typeof lat==='string'&&lat.trim()?Number(lat):NaN,b=typeof lon==='number'?lon:typeof lon==='string'&&lon.trim()?Number(lon):NaN;
 return Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a)<=90&&Math.abs(b)<=180&&(a!==0||b!==0)?{latitude:a,longitude:b}:null;
}
export function mergeRoamMap(tracked:LinkedJcbMachine[],hires:RoamHire[],now=Date.now()):LinkedJcbMachine[]{
 void now; // Kept for API compatibility; ROAM must never override tracker freshness or data.
 const result=[...tracked],used=new Set<string>();
 for(const h of [...hires].filter(h=>h.status==='on_site').sort((a,b)=>String(b.delivery.delivered_at??'').localeCompare(String(a.delivery.delivered_at??'')))){
  const fleet=str(h.machine.fleet),key=fleetKey(fleet),id=str(h.machine.relay_id),dedupe=key||id||h.id;
  if(used.has(dedupe))continue;used.add(dedupe);
  const candidates=tracked.filter(m=>(id&&m.relay?.id===id)||(key&&fleetKey(m.relay?.machine_number||m.equipmentId)===key));
  const match=candidates.length===1?candidates[0]:null;
  const metadata={id:h.id,reference:h.hire_reference,site:str(h.site.name)||str(h.site.address),locationType:'site' as 'site'|'delivery',fleet};
  if(match){
   // ROAM hire information enriches the provider record. It must not replace
   // AssetCare+/JCB/Trackunit/Takeuchi telemetry, even when that data is stale.
   result[result.indexOf(match)]={...match,roamHire:metadata};continue;
  }
  const delivery=h.delivery.location&&typeof h.delivery.location==='object'?h.delivery.location as Record<string,unknown>:{};
  const site=coords(h.site.latitude,h.site.longitude),position=site??coords(delivery.lat,delivery.lng);
  metadata.locationType=site?'site':'delivery';
  const relay=/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)?{id,machine_number:fleet,make:str(h.machine.make)||null,model:str(h.machine.model)||null,serial_number:str(h.machine.serial)||null}:null;
  const fallback:LinkedJcbMachine={source:'roam',pin:h.id,equipmentId:fleet||h.hire_reference,model:str(h.machine.model)||str(h.machine.type),relay,match:relay?'exact':'unmatched',position:position?{...position,at:null}:null,roamHire:metadata,assetCategory:'Unclassified',roamMake:str(h.machine.make)};
  // ROAM-only assets use recorded hire coordinates, which are never telemetry.
  result.push(fallback);
 }
 return result;
}
