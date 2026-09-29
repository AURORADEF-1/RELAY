import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
 const headers = {'Cache-Control':'private, no-store'};
 const authorization=request.headers.get('authorization');
 if(!authorization?.startsWith('Bearer '))return NextResponse.json({error:'Sign in to view Sign Watch.'},{status:401,headers});
 const base=process.env.NEXT_PUBLIC_SUPABASE_URL;
 if(!base)return NextResponse.json({error:'Sign Watch is not configured.'},{status:503,headers});
 try {
  const response=await fetch(`${base}/functions/v1/sign-watch-test`,{headers:{Authorization:authorization},cache:'no-store',signal:AbortSignal.timeout(10000)});
  const data=await response.json();
  return NextResponse.json(data,{status:response.status,headers});
 } catch {return NextResponse.json({error:'Sign Watch readings are temporarily unavailable.'},{status:503,headers});}
}
