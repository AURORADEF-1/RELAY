'use client';
import {useEffect,useState} from 'react';
import {usePathname} from 'next/navigation';
import {assetRequest} from './request';
export function AssetInboxBadge(){
 const path=usePathname(),[count,setCount]=useState<number|null>(null);
 useEffect(()=>{const c=new AbortController();const refresh=()=>{if(document.visibilityState==='hidden')return;void assetRequest<{unread:number}>('/api/assets/inbox?summary=true',c.signal).then(d=>{if(!c.signal.aborted)setCount(d.unread);}).catch(()=>{if(!c.signal.aborted)setCount(null);});};refresh();const timer=setInterval(refresh,300000);window.addEventListener('asset-inbox-changed',refresh);document.addEventListener('visibilitychange',refresh);return()=>{c.abort();clearInterval(timer);window.removeEventListener('asset-inbox-changed',refresh);document.removeEventListener('visibilitychange',refresh);};},[path]);
 return count?<span aria-label={`${count} unread asset updates`} style={{marginLeft:'auto',borderRadius:12,padding:'2px 7px',background:'#12627a',color:'white',fontSize:12}}>{count>99?'99+':count}</span>:null;
}
