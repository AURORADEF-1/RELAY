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

export async function POST(request:NextRequest){try{
 await authorizeAssets(request,false);
 const body=await request.json().catch(()=>null) as {points?:unknown}|null;
 if(!body||!Array.isArray(body.points)||body.points.length<1||body.points.length>50||!body.points.every(valid))throw new JcbError('Choose between 1 and 50 valid map positions.',400);
 const key=process.env.MAPTILER_KEY??process.env.NEXT_PUBLIC_MAPTILER_KEY;
 if(!key)throw new JcbError('Address lookup is not configured.',503);
 const points=body.points as Point[],query=points.map(point=>`${point.longitude.toFixed(5)},${point.latitude.toFixed(5)}`).join(';');
 const url=`https://api.maptiler.com/geocoding/${query}.json?${new URLSearchParams({key,language:'en',country:'gb'})}`;
 const response=await fetch(url,{headers:{Accept:'application/json'},next:{revalidate:2592000}});
 if(!response.ok)throw new JcbError('Address lookup is temporarily unavailable.',503);
 const payload=await response.json() as FeatureCollection|FeatureCollection[];
 const collections=Array.isArray(payload)?payload:[payload];
 return jcbJson({addresses:points.map((_,index)=>address(collections[index]))});
 }catch(error){return jcbError(error);}}
