// Disposable PostgreSQL policy verification; never connects to production.
// Install @electric-sql/pglite in a temporary directory, then set PGLITE_MODULE
// to its dist/index.js path. No runtime dependency is added to RELAY.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const admin = '00000000-0000-0000-0000-000000000001';
const fitter = '00000000-0000-0000-0000-000000000002';
const requester = '00000000-0000-0000-0000-000000000003';
const machine = '10000000-0000-0000-0000-000000000001';
let checks = 0;
const expectRows = async (sql, count) => { assert.equal((await db.query(sql)).rows.length, count); checks++; };
const denied = async (sql, code = '42501') => { await assert.rejects(db.query(sql), e => e.code === code); checks++; };
const as = async id => { await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${id}', false);`); };
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
    create table public.profiles (id uuid primary key, role text not null);
    create table public.machines (id uuid primary key);
    grant select on public.profiles, public.machines to authenticated;
    insert into public.profiles values ('${admin}', 'admin'), ('${fitter}', 'requester'), ('${requester}', 'requester');
    insert into public.machines values ('${machine}');
  `);
  await db.exec(await readFile(new URL('../supabase/migrations/20260924090311_jcb_livelink_access_and_mappings.sql', import.meta.url), 'utf8'));
  await as(admin);
  await db.exec(`insert into public.jcb_livelink_access(user_id,enabled) values ('${fitter}',true),('${requester}',false);
    insert into public.jcb_livelink_mappings(pin,machine_id) values ('JCB-TEST','${machine}');`);
  await expectRows('select * from public.jcb_livelink_access', 2);
  await expectRows('select * from public.jcb_livelink_mappings', 1);
  await denied(`insert into public.jcb_livelink_mappings(pin,machine_id) values ('JCB-DUP','${machine}')`, '23505');
  await as(fitter);
  await expectRows('select * from public.jcb_livelink_access', 1);
  await expectRows('select * from public.jcb_livelink_mappings', 1);
  await denied(`insert into public.jcb_livelink_access(user_id,enabled) values ('${admin}',true)`);
  await expectRows(`update public.jcb_livelink_access set enabled=true where user_id='${requester}' returning *`, 0);
  await expectRows(`update public.jcb_livelink_access set enabled=false where user_id='${fitter}' returning *`, 0);
  await expectRows("delete from public.jcb_livelink_mappings returning *", 0);
  await denied(`insert into public.jcb_livelink_mappings(pin,machine_id) values ('FITTER','${machine}')`);
  await denied(`update public.profiles set role='admin' where id='${fitter}'`);
  await as(requester);
  await expectRows('select * from public.jcb_livelink_access', 1);
  await expectRows('select * from public.jcb_livelink_mappings', 0);
  await denied(`insert into public.jcb_livelink_access(user_id,enabled) values ('${admin}',true)`);
  await as(admin);
  await expectRows(`update public.jcb_livelink_access set enabled=false where user_id='${fitter}' returning *`, 1);
  await as(fitter);
  await expectRows('select * from public.jcb_livelink_mappings', 0);
  await db.exec('reset role; set role anon;');
  await denied('select * from public.jcb_livelink_access');
  await denied('select * from public.jcb_livelink_mappings');
  await as(admin);
  await expectRows('delete from public.jcb_livelink_mappings returning *', 1);
  await expectRows('delete from public.jcb_livelink_access returning *', 2);
  console.log(`JCB RLS: ${checks} checks passed against the actual migration in disposable PostgreSQL.`);
} finally { await db.close(); }
