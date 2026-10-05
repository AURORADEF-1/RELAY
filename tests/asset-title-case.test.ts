import {describe,expect,it} from 'vitest';
import {titleCaseAssetLabel,titleCaseAssetText} from '@/lib/integrations/jcb/types';

describe('asset title casing',()=>{
  it('preserves manufacturers and uppercases alphanumeric model codes',()=>{
    expect(titleCaseAssetText('JCB 3CX')).toBe('JCB 3CX');
    expect(titleCaseAssetText('takeuchi tb216 mini excavator sr')).toBe('Takeuchi TB216 Mini Excavator SR');
    expect(titleCaseAssetText('XCMG XE135E excavator bladed')).toBe('XCMG XE135E Excavator Bladed');
    expect(titleCaseAssetText('Doosan DX170W-7 excavator Hsr')).toBe('Doosan DX170W-7 Excavator HSR');
  });

  it('keeps readable model punctuation and formats asset labels',()=>{
    expect(titleCaseAssetText('jcb 525-60 hi-viz')).toBe('JCB 525-60 Hi-Viz');
    expect(titleCaseAssetLabel('22259 · jcb 3cx')).toBe('22259 · JCB 3CX');
    expect(titleCaseAssetLabel('26405 - xcmg xe135e')).toBe('26405 - XCMG XE135E');
  });
});
