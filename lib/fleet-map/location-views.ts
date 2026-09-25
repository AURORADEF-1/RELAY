export type MapPosition={latitude:number;longitude:number}|null|undefined;
export function locationViews(position:MapPosition){
 if(!position||!Number.isFinite(position.latitude)||!Number.isFinite(position.longitude)||Math.abs(position.latitude)>90||Math.abs(position.longitude)>180||(position.latitude===0&&position.longitude===0))return [];
 const coordinates=`${position.latitude},${position.longitude}`;
 const views:{label:string;params:Record<string,string>}[]=[
  {label:'Street View',params:{api:'1',map_action:'pano',viewpoint:coordinates}},
  {label:'Satellite',params:{api:'1',map_action:'map',center:coordinates,zoom:'18',basemap:'satellite'}},
  {label:'Terrain',params:{api:'1',map_action:'map',center:coordinates,zoom:'14',basemap:'terrain'}},
 ];
 return views.map(({label,params})=>({label,href:`https://www.google.com/maps/@?${new URLSearchParams(params)}`}));
}
