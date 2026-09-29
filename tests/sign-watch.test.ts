import {describe,it,expect} from 'vitest';
import {signWatchState,type SignWatchFeed} from '@/lib/sign-watch/model';
const now=Date.parse('2026-09-29T13:00:00Z');
const feed=():SignWatchFeed=>({stale:false,latest:{received_at:new Date(now).toISOString(),payload:{status:'level',calibrated:true,calibrated_at:new Date(now).toISOString(),sensor_age_ms:50,tilt_deg:2,pitch_deg:1,roll_deg:-1,gps:{fix:true,latitude:52,longitude:1,satellites:7,age_ms:50}}}});
describe('Sign Watch Fleet freshness',()=>{
 it('shows live calibrated readings and location',()=>{const s=signWatchState(feed(),now);expect(s.live).toBe(true);expect(s.tilt).toBe(2);expect(s.location).toEqual({latitude:52,longitude:1});});
 it('expires the feed even when the previous response was fresh',()=>{const s=signWatchState(feed(),now+21000);expect(s.label).toBe('Feed offline');expect(s.tilt).toBeNull();expect(s.location).toBeNull();});
 it('does not show old angles as live when polling fails',()=>expect(signWatchState(feed(),now,true).tilt).toBeNull());
 it('does not display stale sensor readings from a fresh bridge upload',()=>{const f=feed();f.latest!.payload.status='offline';expect(signWatchState(f,now).tilt).toBeNull();});
 it('does not show an uncalibrated angle',()=>{const f=feed();f.latest!.payload.calibrated=false;expect(signWatchState(f,now).tilt).toBeNull();});
 it('hides expired GPS fixes',()=>{const f=feed();f.latest!.payload.gps.age_ms=11000;expect(signWatchState(f,now).location).toBeNull();});
});
