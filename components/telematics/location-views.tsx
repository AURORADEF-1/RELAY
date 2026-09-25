import {locationViews,type MapPosition} from '@/lib/fleet-map/location-views';
export function LocationViews({position}:{position:MapPosition}){
 const views=locationViews(position);if(!views.length)return null;
 return <div className="fleet-location-views"><div className="jcb-actions" aria-label="View this location in Google Maps">{views.map(view=><a className="jcb-button" key={view.label} href={view.href} target="_blank" rel="noopener noreferrer">{view.label} ↗</a>)}</div><p className="jcb-sync">Opens Google Maps at the last reported position. Street View shows nearby available imagery, not a live camera; coverage and image dates vary.</p></div>;
}
