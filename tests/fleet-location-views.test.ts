import {expect,it} from 'vitest';
import {locationViews} from '@/lib/fleet-map/location-views';
it('uses official Google Maps URLs with exact coordinates and no API key',()=>{
 const links=locationViews({latitude:52.39159,longitude:.95505});expect(links).toHaveLength(3);
 const street=new URL(links[0].href);expect(street.origin).toBe('https://www.google.com');expect(street.searchParams.get('api')).toBe('1');expect(street.searchParams.get('viewpoint')).toBe('52.39159,0.95505');expect(street.searchParams.get('map_action')).toBe('pano');expect(street.searchParams.has('key')).toBe(false);
 expect(new URL(links[1].href).searchParams.get('basemap')).toBe('satellite');expect(new URL(links[2].href).searchParams.get('basemap')).toBe('terrain');
});
it('does not produce location links for missing or invalid GPS',()=>{for(const p of [null,{latitude:NaN,longitude:1},{latitude:91,longitude:1},{latitude:52,longitude:181},{latitude:0,longitude:0}])expect(locationViews(p)).toEqual([]);});
