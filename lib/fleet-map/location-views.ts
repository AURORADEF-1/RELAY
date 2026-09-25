export type MapPosition={latitude:number;longitude:number}|null|undefined;
export function locationViews(position:MapPosition){
 if(!position||!Number.isFinite(position.latitude)||!Number.isFinite(position.longitude)||Math.abs(position.latitude)>90||Math.abs(position.longitude)>180||(position.latitude===0&&position.longitude===0))return [];
 const coordinates=`${position.latitude},${position.longitude}`;
 // A centre-only Maps URL deliberately has no marker. Use a coordinate query.
 return [
  {label:'Map pin',href:`https://www.google.com/maps/search/?${new URLSearchParams({api:'1',query:coordinates})}`},
  {label:'Street View',href:`https://www.google.com/maps/@?${new URLSearchParams({api:'1',map_action:'pano',viewpoint:coordinates})}`},
  {label:'Satellite',href:`https://www.google.com/maps?${new URLSearchParams({q:coordinates,t:'k',z:'18'})}`},
  {label:'Terrain',href:`https://www.google.com/maps?${new URLSearchParams({q:coordinates,t:'p',z:'14'})}`},
 ];
}
