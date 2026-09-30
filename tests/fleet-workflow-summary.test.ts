import {describe,it,expect} from 'vitest';
import {summariseBlockers} from '../lib/fleet-workflow/blocker-summary';
describe('workflow blocker presentation',()=>{
 it('keeps large fault histories readable without changing clearance evidence',()=>{
  const blockers=Object.freeze(['Workshop inspection required',...Array.from({length:1531},(_,i)=>`Fault requires review: fictional-${i}`),'Open parts request: fictional-a','Open parts request: fictional-b']);
  expect(summariseBlockers(blockers)).toEqual(['Workshop inspection required','1,531 fault reports require review','2 open parts requests']);
  expect(blockers).toHaveLength(1534);
 });
 it('retains unknown warnings and handles single reports',()=>{
  expect(summariseBlockers(['Fault requires review: fictional','Service due by hours','Open workshop job: fictional'])).toEqual(['1 fault report requires review','Service due by hours','1 open workshop job']);
  expect(summariseBlockers([])).toEqual([]);
 });
});
