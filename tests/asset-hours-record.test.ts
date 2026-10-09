import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

describe('machine record hour readings',()=>{
 it('keeps ROAM hour information inside the machine record',()=>{
  const source=readFileSync(new URL('../components/assets/workspace.tsx',import.meta.url),'utf8');
  expect(source).toContain("['hours','Hour readings']");
  expect(source).toContain("tab==='hours'&&<AssetHours machineId={id} embedded");
  expect(source).not.toContain('ROAM hour readings / export</Link>');
 });
});
