import type {NextRequest} from 'next/server';
import {authorizeAssets} from '@/lib/assets/access';
import {jcbError,jcbJson} from '@/lib/integrations/jcb/server';
import {JcbError} from '@/lib/integrations/jcb/client';

type Point={latitude:number;longitude:number};
type Feature={place_name?:unknown;place_name_en?:unknown;text?:unknown;place_type?:unknown};
type FeatureCollection={features?:Feature[]};

function valid(point:unknown):point is Point{
 if(!point||typeof point!=='object'||Array.isArray(point))return false;
 const p=point as Record<string,unknown>;
 return typeof p.latitude==='number'&&Number.isFinite(p.latitude)&&Math.abs(p.latitude)<=90&&typeof p.longitude==='number'&&Number.isFinite(p.longitude)&&Math.abs(p.longitude)<=180&&(p.latitude!==0||p.longitude!==0);
}
function address(collection:FeatureCollection|undefined){
 const features=Array.isArray(collection?.features)?collection.features:[];
 const rank=(feature:Feature)=>{const types=Array.isArray(feature.place_type)?feature.place_type:[];return ['address','poi','road','place','locality'].findIndex(type=>types.includes(type));};
 const feature=[...features].sort((a,b)=>{const ar=rank(a),br=rank(b);return (ar<0?99:ar)-(br<0?99:br);})[0];
 const value=feature?.place_name_en??feature?.place_name??feature?.text;
 return typeof value==='string'&&value.trim()?value.trim().slice(0,240):null;
}

function requestedPoints(request:NextRequest):unknown[]{
 const value=request.nextUrl.searchParams.get('points');
 if(!value)return [];
 return value.split(';').map(pair=>{const [longitude,latitude,...extra]=pair.split(',');return extra.length?null:{latitude:Number(latitude),longitude:Number(longitude)};});
}

export async function GET(request:NextRequest){try{
 await authorizeAssets(request,false);
 const requested=requestedPoints(request);
 if(requested.length<1||requested.length>50||!requested.every(valid))throw new JcbError('Choose between 1 and 50 valid map positions.',400);
 const key=process.env.MAPTILER_KEY??process.env.NEXT_PUBLIC_MAPTILER_KEY;
 if(!key)throw new JcbError('Address lookup is not configured.',503);
 const points=requested as Point[],query=points.map(point=>`${point.longitude.toFixed(5)},${point.latitude.toFixed(5)}`).join(';');
 const url=`https://api.maptiler.com/geocoding/${query}.json?${new URLSearchParams({key,language:'en',country:'gb'})}`;
 const response=await fetch(url,{headers:{Accept:'application/json'},next:{revalidate:2592000}});
 if(!response.ok)throw new JcbError('Address lookup is temporarily unavailable.',503);
 const payload=await response.json() as FeatureCollection|FeatureCollection[];
 const collections=Array.isArray(payload)?payload:[payload];
 return jcbJson({addresses:points.map((_,index)=>address(collections[index]))});
 }catch(error){return jcbError(error);}}
