// Actual migrations in disposable PostgreSQL; no production connection.
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const admin='00000000-0000-0000-0000-000000000001',fitter='00000000-0000-0000-0000-000000000002',customer='00000000-0000-0000-0000-000000000003',machine='10000000-0000-0000-0000-000000000001';
const as=async(id)=>db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`);
let checks=0;const rows=async(sql,n)=>{assert.equal((await db.query(sql)).rows.length,n);checks++;};const deny=async(sql)=>{await assert.rejects(db.query(sql),e=>e.code==='42501');checks++;};
try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create table public.profiles(id uuid primary key,role text);create table public.machines(id uuid primary key);create table public.notifications(id uuid default gen_random_uuid(),user_id uuid,ticket_id uuid,type text,title text,body text);grant select on public.profiles,public.machines to authenticated;grant select on public.profiles to service_role;grant insert,select on public.notifications to service_role;insert into public.profiles values('${admin}','admin'),('${fitter}','requester'),('${customer}','requester');insert into public.machines values('${machine}');`);
 await db.exec(await readFile(new URL('../supabase/migrations/20260924090311_jcb_livelink_access_and_mappings.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/migrations/20260924120432_trackunit_fleet_health.sql',import.meta.url),'utf8'));
 await as(admin);await db.exec(`insert into public.jcb_livelink_access(user_id,enabled) values('${fitter}',true);insert into public.trackunit_mappings(pin,machine_id) values('MAN-TEST','${machine}')`);
 await rows('select * from public.trackunit_mappings',1);
 await as(fitter);await rows('select * from public.trackunit_mappings',1);await deny(`insert into public.trackunit_mappings(pin,machine_id) values('BAD','${machine}')`);await rows("update public.trackunit_mappings set pin='BAD' returning *",0);await rows('delete from public.trackunit_mappings returning *',0);await deny("select public.deliver_trackunit_health_digest('[]',1,1,0,null)");await rows('select * from public.trackunit_health_runs',0);await deny('select * from public.trackunit_health_deliveries');
 await as(customer);await rows('select * from public.trackunit_mappings',0);await deny(`insert into public.jcb_livelink_access(user_id,enabled) values('${customer}',true)`);
 await db.exec('reset role;set role anon');await deny('select * from public.trackunit_mappings');await deny("select public.deliver_trackunit_health_digest('[]',1,1,0,null)");
 await db.exec('reset role;set role service_role');
 const rpc=`select public.deliver_trackunit_health_digest('[{"key":"MAN-TEST:fault:1","summary":"Machine test: inspect reported fault"}]',1,1,0,null) as sent`;
 assert.equal((await db.query(rpc)).rows[0].sent,1);checks++;assert.equal((await db.query(rpc)).rows[0].sent,0);checks++;
 await db.exec('reset role');await rows(`select * from public.notifications where user_id='${admin}' and type='trackunit_health'`,1);await rows(`select * from public.notifications where user_id<>'${admin}'`,0);
 await db.exec("update public.trackunit_health_deliveries set notified_at=now()-interval '25 hours';set role service_role");assert.equal((await db.query(rpc)).rows[0].sent,1);checks++;
 await as(admin);await rows('select * from public.trackunit_health_runs',3);await db.exec(`update public.jcb_livelink_access set enabled=false where user_id='${fitter}'`);await as(fitter);await rows('select * from public.trackunit_mappings',0);
 console.log(`Trackunit database: ${checks} permission and digest checks passed.`);
}finally{await db.close();}
