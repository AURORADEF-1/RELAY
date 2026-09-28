import {expect,it} from 'vitest';
import {flagAssetKey,flagForMachine,flagSchema,type AssetFlag} from '@/lib/assets/flags';
import type {LinkedJcbMachine} from '@/lib/integrations/jcb/types';
const machine={pin:'a',source:'jcb',relay:{id:'relay-id'}} as LinkedJcbMachine;
const flag={id:'flag',asset_key:'relay:relay-id',provider:'jcb',pin:'a',machine_id:'relay-id',resolved_at:null} as AssetFlag;
it('shares a linked-machine flag across providers without leaking to unrelated assets',()=>{
 expect(flagAssetKey(machine)).toBe('relay:relay-id');
 expect(flagForMachine([flag],{...machine,source:'assetcare',pin:'b'})).toBe(flag);
 expect(flagForMachine([flag],{...machine,pin:'c',relay:null})).toBeUndefined();
 expect(flagForMachine([{...flag,resolved_at:'2026-09-28'}],machine)).toBeUndefined();
});
it('keeps an unlinked flag recognizable when the machine is linked later',()=>{
 expect(flagForMachine([{...flag,asset_key:'jcb:a',machine_id:null}],machine)).toBeTruthy();
 expect(flagAssetKey({...machine,relay:null})).toBe('jcb:a');
});
it('requires bounded reasons and rejects unknown provider or invalid resolution',()=>{
 const body={action:'flag',id:'00000000-0000-4000-8000-000000000001',provider:'jcb',pin:'a',reason:'Late movement'};
 expect(flagSchema.safeParse(body).success).toBe(true);
 expect(flagSchema.safeParse({...body,reason:' '.repeat(20)}).success).toBe(false);
 expect(flagSchema.safeParse({...body,reason:'x'.repeat(501)}).success).toBe(false);
 expect(flagSchema.safeParse({...body,provider:'unknown'}).success).toBe(false);
 expect(flagSchema.safeParse({action:'resolve',id:body.id,resolution:''}).success).toBe(false);
});
