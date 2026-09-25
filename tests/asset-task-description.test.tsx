import {expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {TaskDescription} from '@/components/assets/task-description';
it('renders location as a safe clickable map link and escapes other text',()=>{const html=renderToStaticMarkup(<TaskDescription text={'Breakdown: <script>bad</script>\nhttps://www.google.com/maps/search/?api=1&query=52,1'}/>);expect(html).toContain('Open asset location');expect(html).toContain('noopener noreferrer');expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>');});
it('lets a fitter tap the site contact number',()=>{const html=renderToStaticMarkup(<TaskDescription text={'Phone: +44 1234 567890\n\nLocation'}/>);expect(html).toContain('href="tel:+441234567890"');});
