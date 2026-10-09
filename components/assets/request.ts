import {getSupabaseAccessToken,getSupabaseClient} from '@/lib/supabase';
export async function assetRequest<T>(url:string,signal?:AbortSignal,body?:unknown):Promise<T>{
 const send=(token:string)=>fetch(url,{signal,method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 let token=await getSupabaseAccessToken();if(!token)throw Error('Sign in to view assets.');let r=await send(token);
 if(r.status===401){const {data}=await getSupabaseClient()!.auth.refreshSession();token=data.session?.access_token??null;if(token)r=await send(token);}
 const text=await r.text();let d:unknown;
 try{d=JSON.parse(text);}catch{throw Error('Asset information unavailable. Please refresh and try again.');}
 if(!r.ok)throw Error(typeof d==='object'&&d!==null&&'error' in d&&typeof d.error==='string'?d.error:'Asset information unavailable.');return d as T;
}
