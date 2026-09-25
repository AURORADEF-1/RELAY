import {expect,it} from 'vitest';
import {locationViews} from '@/lib/fleet-map/location-views';
it('pins exact coordinates in map views and keeps Street View separate',()=>{
 const links=locationViews({latitude:52.39159,longitude:.95505});expect(links).toHaveLength(4);
 const street=new URL(links[1].href);expect(street.origin).toBe('https://www.google.com');expect(street.searchParams.get('api')).toBe('1');expect(street.searchParams.get('viewpoint')).toBe('52.39159,0.95505');expect(street.searchParams.get('map_action')).toBe('pano');expect(street.searchParams.has('key')).toBe(false);
 const pin=new URL(links[0].href);expect(pin.pathname).toBe('/maps/search/');expect(pin.searchParams.get('query')).toBe('52.39159,0.95505');
 for(const [index,layer] of [[2,'k'],[3,'p']] as const){const url=new URL(links[index].href);expect(url.searchParams.get('q')).toBe('52.39159,0.95505');expect(url.searchParams.get('t')).toBe(layer);expect(url.searchParams.has('center')).toBe(false);}
});
it('does not produce location links for missing or invalid GPS',()=>{for(const p of [null,{latitude:NaN,longitude:1},{latitude:91,longitude:1},{latitude:52,longitude:181},{latitude:0,longitude:0}])expect(locationViews(p)).toEqual([]);});
