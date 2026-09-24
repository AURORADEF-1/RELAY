import type { LinkedJcbMachine } from '../jcb/types';
export type TrackingSource = { provider: 'jcb' | 'trackunit'; available: boolean; checked_at: string | null };
export function trackingSnapshot(groups: {source: TrackingSource; machines: LinkedJcbMachine[]}[], allowedIds: Set<string>, now = Date.now()) {
  const assets = new Map<string, {relay_id:string;tracking_id:string;provider:string;fleet_number:string;manufacturer:string;model:string|null;serial_number:string|null;latitude:number;longitude:number;position_at:string|null;position_status:string;feed_checked_at:string|null}>();
  const excluded = {unmatched:0,not_mlp_active:0,no_position:0,duplicate:0};
  for (const {source,machines} of groups) for (const m of machines) {
    if (!m.relay || !['exact','confirmed'].includes(m.match)) {excluded.unmatched++;continue;}
    if (!allowedIds.has(m.relay.id)) {excluded.not_mlp_active++;continue;}
    const p=m.position;
    if (!p || !Number.isFinite(p.latitude) || !Number.isFinite(p.longitude) || Math.abs(p.latitude)>90 || Math.abs(p.longitude)>180 || (p.latitude===0&&p.longitude===0)) {excluded.no_position++;continue;}
    const at=p.at&&Number.isFinite(Date.parse(p.at))?p.at:null;
    const age=at?now-Date.parse(at):null;
    const row={relay_id:m.relay.id,tracking_id:`${source.provider}:${m.pin}`,provider:source.provider,fleet_number:m.relay.machine_number,manufacturer:m.relay.make|| (source.provider==='jcb'?'JCB':'Manitou'),model:m.relay.model,serial_number:m.relay.serial_number,latitude:p.latitude,longitude:p.longitude,position_at:at,position_status:age===null?'unknown':age<0?'check_timestamp':age>=24*3600000?'stale':'recent',feed_checked_at:source.checked_at};
    const old=assets.get(row.relay_id);
    if (old) {excluded.duplicate++;if ((Date.parse(old.position_at||'')||0)>=(Date.parse(at||'')||0)) continue;}
    assets.set(row.relay_id,row);
  }
  return {schema_version:1,generated_at:new Date(now).toISOString(),complete:groups.every(g=>g.source.available),sources:groups.map(g=>g.source),assets:[...assets.values()].sort((a,b)=>a.relay_id.localeCompare(b.relay_id)),excluded};
}
