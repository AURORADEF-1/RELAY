import {readFileSync} from 'node:fs';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const {PGlite}=await import(pathToFileURL(process.argv[2]).href),db=new PGlite();
await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
await db.exec(readFileSync(new URL('../supabase/migrations/20260925095235_assetcare_stream.sql',import.meta.url),'utf8'));
const owner='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002';
for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);for(const table of ['assetcare_stream_state','assetcare_batches','assetcare_assets'])await assert.rejects(db.query(`select * from ${table}`),/permission denied/);await assert.rejects(db.query(`select claim_assetcare_stream('${owner}')`),/permission denied/);await assert.rejects(db.query(`select save_assetcare_batch('${owner}','hash','[]','[]')`),/permission denied/);await db.exec('reset role');}
await db.exec('set role service_role');assert.equal((await db.query(`select claim_assetcare_stream('${owner}') as ok`)).rows[0].ok,true);assert.equal((await db.query(`select claim_assetcare_stream('${other}') as ok`)).rows[0].ok,false);
assert.equal((await db.query(`select save_assetcare_batch('${other}','hash','[]','[]') as ok`)).rows[0].ok,false);
const assets=JSON.stringify([{asset_id:'a',name:'test',observed_at:'2026-09-25T10:00:00Z',machine:{pin:'a'}}]);
for(let i=0;i<2;i++)assert.equal((await db.query(`select save_assetcare_batch($1,'hash','[{}]',$2) as ok`,[owner,assets])).rows[0].ok,true);
assert.equal((await db.query('select * from assetcare_batches')).rows.length,1);
await db.query(`select save_assetcare_batch($1,'older','[]',$2)`,[owner,assets.replace('10:00:00','09:00:00')]);assert.equal(new Date((await db.query('select observed_at from assetcare_assets')).rows[0].observed_at).toISOString(),'2026-09-25T10:00:00.000Z');
await db.exec(`update assetcare_stream_state set lease_until=now()-interval '1 second'`);assert.equal((await db.query(`select save_assetcare_batch('${owner}','expired','[]','[]') as ok`)).rows[0].ok,false);
console.log('PASS: service-only queue storage, mutually exclusive collectors, lease fencing, replay deduplication and older readings cannot replace newer ones.');await db.close();
