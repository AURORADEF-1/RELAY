"use client";
import Link from "next/link";
import { faultAdvice, latestFaults } from "@/lib/integrations/jcb/health";
import { partsRequestUrl, type JcbFault, type LinkedJcbMachine } from "@/lib/integrations/jcb/types";
export function FaultCards({machine,faults,checkedAt,preview=false,now=Date.parse(checkedAt)}: {machine:LinkedJcbMachine;faults:JcbFault[];checkedAt:string;preview?:boolean;now?:number}) {
  return <section className="fh-faults"><div className="fh-section-title"><div><span className="fh-eyebrow">FITTER VIEW</span><h3>Faults &amp; next steps</h3></div><span className="fh-tag">{latestFaults(faults).length} codes</span></div>
    <p className="fh-muted">JCB reports, last checked {new Date(checkedAt).toLocaleString("en-GB")}. Active or cleared status is not supplied.</p>
    {!faults.length && <div className="fh-empty"><strong>No fault records returned</strong><p>This is not a mechanical all-clear. Check any warning on the machine itself.</p></div>}
    {latestFaults(faults).map(f=>{const advice=faultAdvice(f,now);const href=partsRequestUrl(machine,f.code);return <article className={`fh-fault fh-${advice.priority}`} key={advice.key}>
      <div className="fh-section-title"><span className={`fh-badge fh-${advice.priority}`}>{advice.title}</span><span className="fh-code">{f.code}</span></div>
      <h4>{advice.detail}</h4><p className="fh-muted">JCB severity: {f.severity} · Reported {f.at ? new Date(f.at).toLocaleString("en-GB") : "time unavailable"}</p>
      <div className="fh-action"><strong>What to do next</strong><p>{advice.action}</p></div>
      <details><summary>See original JCB report</summary><p>{f.description}</p><p>Code {f.code} · {f.severity}. Suggested checks are rule-based triage, not a confirmed diagnosis.</p></details>
      {href && (preview ? <button className="fh-button" onClick={()=>window.alert("Preview only — in RELAY this opens a parts request with the selected machine and dated fault code attached.")}>Request parts / inspection ↗</button> : <Link className="fh-button" href={href}>Request parts / inspection ↗</Link>)}
    </article>})}
  </section>;
}
