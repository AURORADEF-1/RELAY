"use client";
import dynamic from "next/dynamic";
import { FaultCards } from "./fault-cards";
import "./health.css";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseAccessToken } from "@/lib/supabase";
import { partsRequestUrl, positionAge, type JcbFleetResponse, type JcbFault, type Reading, type RegistryMachine } from "@/lib/integrations/jcb/types";

const FleetMap = dynamic(() => import("@/components/jcb/livelink-map"), { ssr: false, loading: () => <div className="jcb-map-loading">Loading map…</div> });
async function api<T>(path: string, signal?: AbortSignal, change?: unknown): Promise<T> {
  const token = await getSupabaseAccessToken();
  if (!token) throw new Error("Sign in to use JCB LiveLink.");
  const response = await fetch(`/api/integrations/jcb/${path}`, { method: change ? "POST" : "GET", headers: { Authorization: `Bearer ${token}`, ...(change ? { "Content-Type": "application/json" } : {}) }, body: change ? JSON.stringify(change) : undefined, signal });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Unable to load LiveLink.");
  return result;
}
const date = (value?: string | null) => value ? new Date(value).toLocaleString("en-GB") : "Time unavailable";
function Metric({ label, reading, unit = "" }: { label: string; reading?: Reading<number | boolean> | null; unit?: string }) {
  return <div><dt>{label}</dt><dd>{reading ? typeof reading.value === "boolean" ? reading.value ? "Running" : "Stopped" : `${reading.value.toLocaleString()}${unit}` : "Not supplied"}</dd><small>{reading ? date(reading.at) : ""}</small></div>;
}
type Manage = { profiles: { id: string; full_name: string; role: string }[]; access: { user_id: string; enabled: boolean }[]; registry: RegistryMachine[] };

export function LiveLinkWorkspace({ request = api }: { request?: typeof api }) {
  const detailRef=useRef<HTMLElement>(null);
  const [fleet, setFleet] = useState<JcbFleetResponse | null>(null);
  const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState(""); const [view, setView] = useState<"map" | "list">("map");
  const [selectedPin, setSelectedPin] = useState<string | null>(null);
  const [faultData, setFaultData] = useState<{ pin: string; faults: JcbFault[]; checkedAt: string } | null>(null);
  const [faultError, setFaultError] = useState("");
  const [manage, setManage] = useState<Manage | null>(null); const [manageOpen, setManageOpen] = useState(false);
  const [userId, setUserId] = useState(""); const [machineId, setMachineId] = useState(""); const [saving, setSaving] = useState(false); const [notice, setNotice] = useState("");
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError("");
    try { const data = await request<JcbFleetResponse>("fleet", signal); if (!signal?.aborted) setFleet(data); }
    catch (e) { if (!signal?.aborted) setError(e instanceof Error ? e.message : "Unable to load LiveLink."); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [request]);
  useEffect(() => { const c = new AbortController(); void load(c.signal); return () => c.abort(); }, [load]);
  const machines = useMemo(() => fleet?.machines.filter(m => `${m.relay?.machine_number ?? ""} ${m.equipmentId} ${m.model} ${m.pin}`.toLowerCase().includes(query.toLowerCase().trim())) ?? [], [fleet, query]);
  const selected = fleet?.machines.find(m => m.pin === selectedPin) ?? null;
  useEffect(()=>{if(selectedPin&&window.innerWidth<=1000)detailRef.current?.scrollIntoView({behavior:"smooth",block:"start"});},[selectedPin]);
  const selectMachine = useCallback((pin: string) => { setSelectedPin(pin); setMachineId(""); setFaultError(""); }, []);
  useEffect(() => {
    if (!fleet || !selectedPin) return;
    const c = new AbortController();
    void request<{ faults: JcbFault[]; checkedAt: string }>(`machine?${new URLSearchParams({ pin: selectedPin })}`, c.signal)
      .then(data => { if (!c.signal.aborted) setFaultData({ pin: selectedPin, ...data }); })
      .catch(e => { if (!c.signal.aborted) setFaultError(e.message || "Unable to load faults."); });
    return () => c.abort();
  }, [selectedPin, fleet, request]);
  const openManage = async () => {
    setNotice("");
    try { setManage(await request<Manage>("manage")); setManageOpen(true); }
    catch (e) { setNotice(e instanceof Error ? e.message : "Unable to load settings."); }
  };
  const save = async (change: unknown) => {
    setSaving(true); setNotice("");
    try { await request("manage", undefined, change); setNotice("LiveLink settings saved."); setManage(await request<Manage>("manage")); await load(); }
    catch (e) { setNotice(e instanceof Error ? e.message : "Unable to save settings."); }
    finally { setSaving(false); }
  };
  const exportCsv = () => {
    if (!fleet?.admin) return;
    const cell = (value: unknown) => `"${String(value ?? "").replace(/^[=+@\-\t\r]/, "'$&").replace(/"/g, '""')}"`;
    const rows: unknown[][] = [["RELAY machine", "JCB equipment", "PIN", "Model", "Latitude", "Longitude", "Position reported", "Position age", "Hours", "Hours reported", "Idle hours", "Idle reported", "Fuel %", "Fuel reported", "AdBlue %", "AdBlue reported", "Engine running", "Engine reported", "Fetched at"]];
    for (const m of machines) rows.push([m.relay?.machine_number, m.equipmentId, m.pin, m.model, m.position?.latitude, m.position?.longitude, m.position?.at, positionAge(m.position?.at), m.hours?.value, m.hours?.at, m.idleHours?.value, m.idleHours?.at, m.fuel?.value, m.fuel?.at, m.adblue?.value, m.adblue?.at, m.engine?.value, m.engine?.at, fleet.checkedAt]);
    const url = URL.createObjectURL(new Blob(["\uFEFF" + rows.map(row => row.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `JCB-LiveLink-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const requestHref = selected ? partsRequestUrl(selected) : null;
  return <div className="jcb-workspace">
    <header className="jcb-toolbar"><div><h1>JCB LiveLink</h1><p>{fleet?.admin ? "Machine positions, reported condition and parts requests." : "Find a machine and raise a RELAY parts request."}</p></div><div className="jcb-actions"><button onClick={() => void load()} disabled={loading}>{loading ? "Loading…" : "Refresh view"}</button>{fleet?.admin && <><button onClick={exportCsv}>Export report CSV</button><button onClick={() => void openManage()}>Access &amp; linking</button></>}</div></header>
    {error && <p className="jcb-warning" role="alert">{error} {fleet && "Showing previously loaded data."}</p>}
    {notice && <p className="jcb-notice" role="status">{notice}</p>}
    {fleet && <><p className="jcb-sync">{fleet.machines.length} machines · Fetched {date(fleet.checkedAt)} · Cached for up to 15 minutes. Each reading has its own timestamp.</p>{fleet.stale && <p className="jcb-warning">The connection has not returned fresh fleet data recently. Check individual reading times.</p>}
      <div className="jcb-toolbar"><label className="jcb-search">Find a machine<input placeholder="Fleet number, model or PIN" value={query} onChange={e => setQuery(e.target.value)} /></label><div className="jcb-actions"><button aria-pressed={view === "map"} onClick={() => setView("map")}>Map view</button><button aria-pressed={view === "list"} onClick={() => setView("list")}>List view</button></div></div>
      <div className="jcb-grid"><section className="jcb-results" aria-label="JCB machines">
        {view === "map" && <><FleetMap machines={machines} selectedPin={selectedPin ? `jcb:${selectedPin}` : null} onSelect={key => selectMachine(key.slice(4))} /><p className="jcb-sync">Select a pin to raise a parts request. Amber pins have old or undated positions. {machines.filter(m => !m.position).length} machines have no map position.</p></>}
        <div className="jcb-machine-list">{machines.length ? machines.map(m => <button key={m.pin} className={`jcb-machine ${selectedPin === m.pin ? "selected" : ""}`} onClick={() => selectMachine(m.pin)} aria-pressed={selectedPin === m.pin}><strong>{m.relay?.machine_number || m.equipmentId || m.pin} · {m.model}</strong><span>{m.position ? positionAge(m.position.at) : "Position unavailable"}</span><small>{m.relay ? `RELAY linked · ${m.match}` : "Needs RELAY linking"}</small></button>) : <p>No matching machines.</p>}</div>
      </section><section ref={detailRef} className="jcb-detail" aria-label="Selected machine" aria-live="polite">
        {!selected ? <><h2>Select a machine</h2><p>Choose a map pin or machine from the list to view its position and raise a parts request.</p></> : <>
          <h2>{selected.relay?.machine_number || selected.equipmentId} · {selected.model}</h2><p className="jcb-sync">PIN {selected.pin}</p><h3>Last-known position</h3>
          {selected.position ? <><p>{selected.position.latitude.toFixed(6)}, {selected.position.longitude.toFixed(6)}</p><p>{date(selected.position.at)}</p><p className={positionAge(selected.position.at) !== "Reported within 24 hours" ? "jcb-warning" : "jcb-sync"}>{positionAge(selected.position.at)}. Confirm old locations before travelling.</p><a className="jcb-button" href={`https://www.google.com/maps/dir/?api=1&destination=${selected.position.latitude},${selected.position.longitude}`} target="_blank" rel="noreferrer">Directions to this position</a></> : <p>No position supplied by JCB.</p>}
          {requestHref ? <div className="jcb-actions"><Link className="jcb-button jcb-primary" href={requestHref}>Raise RELAY parts request</Link><Link className="jcb-button" href={fleet.admin ? `/fleet?machine=${encodeURIComponent(selected.relay!.machine_number)}` : "/requests"}>{fleet.admin ? "Machine history" : "My requests"}</Link></div> : <p className="jcb-warning">An admin must link this JCB machine to the RELAY register before a request can be prefilled.</p>}
          {fleet.admin && <><h3>Reported condition</h3><dl className="jcb-metrics"><Metric label="Engine" reading={selected.engine} /><Metric label="Operating hours" reading={selected.hours} unit=" h" /><Metric label="Idle hours" reading={selected.idleHours} unit=" h" /><Metric label="Fuel" reading={selected.fuel} unit="%" /><Metric label="AdBlue" reading={selected.adblue} unit="%" /></dl></>}
          {faultError ? <p role="alert" className="jcb-warning">Fault records unavailable. {faultError}</p> : faultData?.pin !== selected.pin ? <p>Loading fault records…</p> : <FaultCards machine={selected} faults={faultData.faults} checkedAt={faultData.checkedAt} />}

        </>}
      </section></div>
    </>}
    {manageOpen && manage && fleet?.admin && <section className="jcb-management"><div className="jcb-toolbar"><h2>Access &amp; machine linking</h2><button onClick={() => setManageOpen(false)}>Close settings</button></div><div className="jcb-grid"><div><h3>Fitter location access</h3><p>Only enable internal fitters who should see the company JCB and Manitou fleets. Fitters can read machine faults. Fleet-wide health reports and alerts remain admin-only.</p><label>Account<select value={userId} onChange={e => setUserId(e.target.value)}><option value="">Select account</option>{manage.profiles.filter(p => p.role !== "admin").map(p => <option key={p.id} value={p.id}>{p.full_name || p.id} · {manage.access.some(a => a.user_id === p.id && a.enabled) ? "Enabled" : "Disabled"}</option>)}</select></label><div className="jcb-actions"><button disabled={!userId || saving} onClick={() => void save({ action: "access", userId, enabled: true })}>Enable location access</button><button disabled={!userId || saving} onClick={() => void save({ action: "access", userId, enabled: false })}>Remove access</button></div></div><div><h3>Link selected machine</h3>{selected ? <><p>{selected.equipmentId} · {selected.pin}</p><p>Check the full PIN against the machine record before linking.</p><label>RELAY machine<select value={machineId} onChange={e => setMachineId(e.target.value)}><option value="">Select verified machine</option>{manage.registry.map(m => <option key={m.id} value={m.id}>{m.machine_number} · {m.make} {m.model} · {m.serial_number || "No serial"}</option>)}</select></label><button disabled={!machineId || saving} onClick={() => void save({ action: "mapping", pin: selected.pin, machineId })}>Confirm machine link</button>{selected.match === "confirmed" && <button disabled={saving} onClick={() => void save({ action: "mapping", pin: selected.pin, machineId: null })}>Remove manual link</button>}</> : <p>Select a machine on the map or list first.</p>}</div></div></section>}
  </div>;
}
