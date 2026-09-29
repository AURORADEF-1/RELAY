'use client';
import {useEffect,useState} from 'react';
import {getSupabaseClient} from '@/lib/supabase';
import {markNotificationsRead,type RelayNotificationRecord} from '@/lib/notifications';
import {useNotifications} from '@/components/notification-provider';
export function SignWatchAlerts(){
 const [items,setItems]=useState<RelayNotificationRecord[]>([]),[error,setError]=useState(''),[loaded,setLoaded]=useState(false);
 const {desktopNotificationPermission,requestDesktopNotifications}=useNotifications();
 useEffect(()=>{let active=true;let timer:ReturnType<typeof setTimeout>;
  async function load(){try{const db=getSupabaseClient();if(!db)throw Error('Notifications unavailable.');const {data,error}=await db.from('notifications').select('id,user_id,ticket_id,type,title,body,read_at,created_at').eq('type','sign_watch').order('created_at',{ascending:false}).limit(30);if(error)throw error;if(active){setItems(data as RelayNotificationRecord[]);setError('');}}catch{if(active)setError('Unable to load Sign Watch alerts. Retrying…');}finally{if(active){setLoaded(true);timer=setTimeout(load,5000);}}}
  void load();return()=>{active=false;clearTimeout(timer);};
 },[]);
 async function acknowledge(id:string){try{const db=getSupabaseClient();if(!db)throw Error();await markNotificationsRead(db,[id]);setItems(current=>current.map(n=>n.id===id?{...n,read_at:new Date().toISOString()}:n));}catch{setError('Could not acknowledge this alert. Please retry.');}}
 return <section className="sign-watch-card sign-watch-alerts" aria-label="Sign Watch notifications"><h2>Notifications</h2><p>Movement · Knocked over · Still knocked over after 60 seconds</p><p>Alerts are saved for RELAY administrators in both versions. Movement alerts are limited to one every 30 seconds. Fall alerts repeat only after the cone recovers and falls again.</p><p>Browser alerts work while RELAY is open. The connected Mac and USB bridge must remain running.</p>{desktopNotificationPermission==='default'&&<button onClick={()=>void requestDesktopNotifications()}>Enable browser notifications</button>}{desktopNotificationPermission==='denied'&&<p>Browser notifications are blocked in your browser settings. In-app alerts remain available.</p>}{error&&<p role="alert">{error}</p>}<ul>{items.map(n=><li key={n.id}><strong>{n.title}</strong><p>{n.body}</p><time dateTime={n.created_at}>{new Date(n.created_at).toLocaleString('en-GB')}</time>{n.read_at?<small>Acknowledged</small>:<button onClick={()=>void acknowledge(n.id)}>Acknowledge</button>}</li>)}</ul>{!items.length&&<p>{loaded?'No Sign Watch alerts yet.':'Loading alerts…'}</p>}</section>;
}
