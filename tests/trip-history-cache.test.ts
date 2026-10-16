import {expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {tripCache,tripCacheScope} from '@/lib/trip-history/cache';

it('isolates cache entries by the visible fleet scope',()=>{
 expect(tripCacheScope(['b','a'])).toBe(tripCacheScope(['a','b']));
 expect(tripCacheScope(['a'])).not.toBe(tripCacheScope(['a','b']));
});

it('reuses cached work and lets a refresh bypass and replace it',async()=>{
 const load=vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('fresh');
 const key=`test:${Date.now()}:${Math.random()}`;
 expect(await tripCache(key,60_000,load)).toEqual({value:'first',status:'MISS'});
 expect(await tripCache(key,60_000,load)).toEqual({value:'first',status:'HIT'});
 expect(await tripCache(key,60_000,load,true)).toEqual({value:'fresh',status:'BYPASS'});
 expect(await tripCache(key,60_000,load)).toEqual({value:'fresh',status:'HIT'});
 expect(load).toHaveBeenCalledTimes(2);
});
