'use client';

import {useEffect} from 'react';

const reloadKey='relay-client-recovery';

const reloadFresh=()=>{
 const url=new URL(window.location.href);
 url.searchParams.set('_recovery',Date.now().toString(36));
 window.location.replace(url.toString());
};

export default function GlobalError({error}:{error:Error&{digest?:string};reset:()=>void}){
 useEffect(()=>{
  if(sessionStorage.getItem(reloadKey))return;
  sessionStorage.setItem(reloadKey,String(Date.now()));
  const timer=window.setTimeout(reloadFresh,600);
  return()=>window.clearTimeout(timer);
 },[error]);
 const retry=()=>{sessionStorage.removeItem(reloadKey);reloadFresh();};
 return <html lang="en"><body style={{margin:0,background:'#001722',color:'#f3f8fb',fontFamily:'Arial,sans-serif'}}><main style={{minHeight:'100dvh',display:'grid',placeItems:'center',padding:'24px'}}><section style={{width:'min(480px,100%)',boxSizing:'border-box',border:'1px solid #15526c',borderRadius:'14px',background:'#062838',padding:'28px',boxShadow:'inset 4px 0 #2ba5d2, 0 18px 45px #0006'}}><span style={{display:'block',marginBottom:'8px',color:'#45b9e5',fontSize:'11px',fontWeight:800,letterSpacing:'2px'}}>WORKSPACE RECOVERY</span><h1 style={{margin:'0 0 8px',fontSize:'22px'}}>We couldn’t open this page</h1><p style={{margin:'0 0 20px',color:'#a9c4d0',fontSize:'14px',lineHeight:1.55}}>The application may have updated while this page was open. Retry to load the latest AssetCare+ workspace.</p><button type="button" onClick={retry} style={{minHeight:'40px',border:'1px solid #45b9e5',borderRadius:'8px',background:'#1688c9',padding:'8px 18px',color:'#fff',fontWeight:800,cursor:'pointer'}}>Retry</button>{error.digest&&<small style={{display:'block',marginTop:'16px',color:'#668a9b'}}>Reference: {error.digest}</small>}</section></main></body></html>;
}
