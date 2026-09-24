import {spawnSync} from 'node:child_process';
const scanner=process.env.GITLEAKS_BIN||'gitleaks';
// Construct synthetic, non-working canaries in memory. Nothing is persisted.
for(const name of 'JCB_LIVELINK_PASSWORD JCB_LIVELINK_CLIENT_SECRET TRACKUNIT_API_KEY TAKEUCHI_CLIENT_ID TAKEUCHI_CLIENT_SECRET JCB_HEALTH_DATABASE_KEY'.split(' ')){
 for(const input of [`${name}=${'guardcanary'.repeat(3)}`,`process.env.${name} = "${'guardcanary'.repeat(3)}"`]){
  const result=spawnSync(scanner,['stdin','--config','.gitleaks.toml','--redact=100','--no-banner'],{input,encoding:'utf8'});
  if(result.status!==1){console.error(`Secret scanner did not block the ${name} synthetic fixture.`);process.exit(1);}
 }
}
const clean=spawnSync(scanner,['stdin','--config','.gitleaks.toml','--redact=100','--no-banner'],{input:'TRACKUNIT_API_KEY=\nTAKEUCHI_CLIENT_SECRET=\n',encoding:'utf8'});
if(clean.status!==0){console.error('Secret scanner rejected empty configuration.');process.exit(1);}
console.log('Secret scanner blocked all 12 synthetic credentials and accepted empty configuration.');
