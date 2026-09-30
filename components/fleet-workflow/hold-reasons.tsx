import Link from 'next/link';
import type {HireAssessment} from '@/lib/fleet-workflow/model';
import {queueHoldReasons} from '@/lib/fleet-workflow/hold-reasons';
export function HoldReasons({row}:{row:HireAssessment}){
 const issues=queueHoldReasons(row);
 return <div className="hold-reasons">
 {issues.length===0&&<p>No open parts requests, reported faults or confirmed overdue service are listed.</p>}
 {([['Issues to resolve',issues]] as const).map(([title,reasons])=>reasons.length>0&&<section key={title}><h4>{title} ({reasons.length})</h4><ul>{reasons.slice(0,4).map(r=><li key={r.key} className={`hold-reason ${r.tone}`}><strong>{r.title}</strong><p>{r.detail}</p>{r.href&&<Link href={r.href}>View record</Link>}</li>)}</ul>{reasons.length>4&&<details><summary>Show {reasons.length-4} more reasons</summary><ul>{reasons.slice(4).map(r=><li key={r.key} className={`hold-reason ${r.tone}`}><strong>{r.title}</strong><p>{r.detail}</p>{r.href&&<Link href={r.href}>View record</Link>}</li>)}</ul></details>}</section>)}
 </div>;
}
