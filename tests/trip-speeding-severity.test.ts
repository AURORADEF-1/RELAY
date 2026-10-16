import {expect,it} from 'vitest';
import {speedingSeverity} from '@/components/trip-history/speeding-severity';

it('uses amber up to ten percent over the road limit and red above it',()=>{
 expect(speedingSeverity({speeding:true,speed_kph:54.9,speed_limit_kph:50})).toBe('amber');
 expect(speedingSeverity({speeding:true,speed_kph:55,speed_limit_kph:50})).toBe('amber');
 expect(speedingSeverity({speeding:true,speed_kph:55.1,speed_limit_kph:50})).toBe('red');
 expect(speedingSeverity({speeding:false,speed_kph:70,speed_limit_kph:50})).toBeNull();
});
