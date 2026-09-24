import React from 'react';
import Link from 'next/link';
import type {OperationRow} from '@/lib/fleet-operations/report';
export function OpenPartsRequests({requests}:{requests:OperationRow['openPartsRequests']}){
 if(requests===null)return <small>Request status unavailable</small>;
 if(!requests?.length)return null;
 if(requests.length===1)return <Link className="fo-request-badge" href={`/tickets/${encodeURIComponent(requests[0].id)}`}>Open parts request · {requests[0].jobNumber||'View request'}</Link>;
 return <details className="fo-open-requests"><summary className="fo-request-badge">{requests.length} open parts requests</summary><ul>{requests.map(r=><li key={r.id}><Link href={`/tickets/${encodeURIComponent(r.id)}`}>{r.jobNumber||'View request'} · {r.status.replaceAll('_',' ')}</Link></li>)}</ul></details>;
}
