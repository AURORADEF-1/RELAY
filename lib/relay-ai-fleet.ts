import type {LinkedJcbMachine} from '@/lib/integrations/jcb/types';
import {lastKnownSide,usableCoordinates} from '@/lib/plant-wallboard/positions';
export function directionsForPosition(position:LinkedJcbMachine['position'],now:number){
 return usableCoordinates(position,now)?{url:`https://www.google.com/maps/dir/?api=1&destination=${position.latitude},${position.longitude}`,label:'Get directions to this position'}:null;
}
export function answerRequesterFleet(question:string,fleet:{machines:LinkedJcbMachine[];sources:{available:boolean}[]},now=Date.now()){
 const sourceNote=`AssetCare+ fleet tracking · checked ${new Date(now).toLocaleString('en-GB',{timeZone:'Europe/London'})} UK time. People excluded. Locations are last-known, not live.${fleet.sources.some(s=>!s.available)?' One or more feeds are unavailable; this view is incomplete.':''}`;
 const result=(text:string,directions:ReturnType<typeof directionsForPosition>=null)=>({text,sourceNote,copyText:text,directions});
 if(/\b(assign|reassign|delete|disable|change|update)\b/i.test(question))return result('I can find assets and offer directions. Tracking changes require an administrator.');
 const refs=[...new Set(question.match(/\b\d{4,6}\b/g)??[])];
 if(refs.length>1)return result('Which asset do you need? Ask for one fleet reference at a time.');
 if(refs.length){
  const ref=refs[0],matches=fleet.machines.filter(m=>m.relay?.machine_number===ref||m.equipmentId===ref||new RegExp(`^${ref}\\s+[-–—]`).test(m.equipmentId));
  if(matches.length!==1)return result(matches.length?'More than one asset matches. Select the correct asset in Fleet to get directions.':`No accessible fleet tracking record was found for ${ref}. Check the fleet reference or open Fleet to search.`);
  const m=matches[0],p=m.position,directions=directionsForPosition(p,now),side=lastKnownSide(m,now);
  if(!directions||!p)return result(`${ref} · ${m.model}\nNo usable last-known position is available, so I cannot give directions. Check the tracker assignment with an administrator.`);
  const old=!p.at||now-Date.parse(p.at)>86400000;
  return result(`${ref} · ${m.model}\nLast known location: ${side==='off_hire'?'in Garboldisham yard':'outside Garboldisham yard'}.\nGPS fix: ${p.at?new Date(p.at).toLocaleString('en-GB',{timeZone:'Europe/London'}):'time not recorded'}.${old?' This is an old or undated position; confirm before travelling.':''}\n\nNeed directions? Use the button below to open this last-known position in Google Maps.`,directions);
 }
 if(/\b(directions?|navigate|where|location|located)\b/i.test(question))return result('Which machine do you need directions to? Enter its fleet number, for example “Where is machine 26227?”');
 if(/\b(departures?|returns?|movements?|turnaround|director)\b/i.test(question))return result('I can help you find fleet assets and get directions. Detailed movement reports and director summaries are available to administrators. Try “Where is machine 26227?”');
 const located=fleet.machines.filter(m=>usableCoordinates(m.position,now)).length;
 return result(`${fleet.machines.length} fleet assets are visible: ${located} have a usable last-known position and ${fleet.machines.length-located} have no usable position.\n\nWhich machine do you need? Ask “Where is machine 26227?” and I’ll offer directions when a location is available.`);
}
