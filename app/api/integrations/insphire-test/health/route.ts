import {NextRequest} from 'next/server';
import {handleInspHireTest} from '@/lib/integrations/insphire-test/route';
export const runtime='nodejs';export const dynamic='force-dynamic';
export function GET(request:NextRequest){return handleInspHireTest(request,'health');}
