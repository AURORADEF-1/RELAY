import 'server-only';
import {createHash} from 'node:crypto';

type Entry<T>={expiresAt:number;value:Promise<T>};
type CacheStatus='HIT'|'MISS'|'BYPASS';

const entries=new Map<string,Entry<unknown>>();
const MAX_ENTRIES=300;

export const tripCacheScope=(machineIds:string[])=>createHash('sha256').update(machineIds.slice().sort().join('\n')).digest('base64url').slice(0,24);

export async function tripCache<T>(key:string,ttlMs:number,load:()=>Promise<T>,bypass=false):Promise<{value:T;status:CacheStatus}>{
 const now=Date.now(),existing=entries.get(key) as Entry<T>|undefined;
 if(!bypass&&existing&&existing.expiresAt>now){entries.delete(key);entries.set(key,existing);return {value:await existing.value,status:'HIT'};}
 if(existing)entries.delete(key);
 for(const [candidate,entry] of entries)if(entry.expiresAt<=now)entries.delete(candidate);
 while(entries.size>=MAX_ENTRIES)entries.delete(entries.keys().next().value as string);
 const value=load();entries.set(key,{expiresAt:now+ttlMs,value});
 try{return {value:await value,status:bypass?'BYPASS':'MISS'};}catch(error){const current=entries.get(key);if(current?.value===value)entries.delete(key);throw error;}
}
