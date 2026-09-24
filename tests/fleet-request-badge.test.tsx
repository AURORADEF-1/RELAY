import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {OpenPartsRequests} from '@/components/fleet-operations/open-parts-requests';
it('shows a direct job link for one open request and no badge for an empty list',()=>{const html=renderToStaticMarkup(<OpenPartsRequests requests={[{id:'request-id',jobNumber:'R123',status:'ORDERED'}]}/>);expect(html).toContain('Open parts request');expect(html).toContain('/tickets/request-id');expect(html).toContain('R123');expect(renderToStaticMarkup(<OpenPartsRequests requests={[]}/>)).toBe('');});
it('shows all open jobs in a touch-friendly disclosure and labels unavailable checks',()=>{const html=renderToStaticMarkup(<OpenPartsRequests requests={[{id:'a',jobNumber:'R1',status:'READY'},{id:'b',jobNumber:'R2',status:'QUERY'}]}/>);expect(html).toContain('2 open parts requests');expect(html).toContain('/tickets/a');expect(html).toContain('/tickets/b');expect(renderToStaticMarkup(<OpenPartsRequests requests={null}/>)).toContain('Request status unavailable');});
