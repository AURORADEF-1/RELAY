import Link from 'next/link';
import type {HireAssessment} from '@/lib/fleet-workflow/model';
import {summariseBlockers} from '@/lib/fleet-workflow/blocker-summary';
export function HoldReasons({row}:{row:HireAssessment}){
 if(!row.holdReasons)return <ul>{summariseBlockers(row.blockers).map(b=><li key={b}>{b}</li>)}</ul>;
 const issues=row.holdReasons.filter(r=>r.category==='issue'),checks=row.holdReasons.filter(r=>r.category==='check');
 return <div className="hold-reasons">
 {issues.length===0&&<p>No fault or open job blockers are listed in this assessment. Pending checks below still prevent clearance.</p>}
 {([['Issues to resolve',issues],['Return checks / missing information',checks]] as const).map(([title,reasons])=>reasons.length>0&&<section key={title}><h4>{title} ({reasons.length})</h4><ul>{reasons.slice(0,4).map(r=><li key={r.key} className={`hold-reason ${r.tone}`}><strong>{r.title}</strong><p>{r.detail}</p>{r.href&&<Link href={r.href}>View record</Link>}</li>)}</ul>{reasons.length>4&&<details><summary>Show {reasons.length-4} more reasons</summary><ul>{reasons.slice(4).map(r=><li key={r.key} className={`hold-reason ${r.tone}`}><strong>{r.title}</strong><p>{r.detail}</p>{r.href&&<Link href={r.href}>View record</Link>}</li>)}</ul></details>}</section>)}
 </div>;
}
