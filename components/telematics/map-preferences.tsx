'use client';
import {defaults,type Preferences} from '@/lib/fleet-map/preferences';
import {costCentreColour} from '@/lib/fleet-map/cost-centre-colours';
export function MapPreferences({value,onChange,onCollapse,machines=[]}:{value:Preferences;onChange:(p:Preferences)=>void;onCollapse:()=>void;machines?:import('@/lib/integrations/jcb/types').LinkedJcbMachine[]}){
 const set=(patch:Partial<Preferences>)=>onChange({...value,...patch});
 const groups=[...new Set(machines.map(m=>m.assetGroup??'Unmatched'))].filter(group=>group!=='Stock').sort();
 const singleGroup=groups.length===1;
 const toggleGroup=(group:string,checked:boolean)=>set({group:checked?[...value.group,group]:value.group.filter(item=>item!==group)});
 return <section className="fleet-preferences"><header className="fleet-preferences-heading"><strong>Filters &amp; Map Layers</strong><button type="button" onClick={onCollapse} aria-label="Collapse filters and map layers" title="Collapse filters and map layers">‹</button></header><div className="fleet-filter-grid">
 <fieldset><legend>Asset groups</legend><div className="fleet-group-checks" role="group" aria-label="Group or department">{!singleGroup&&<label><input type="checkbox" checked={value.group.length===0} onChange={()=>set({group:[]})}/>All groups</label>}{groups.map(group=><label key={group}><input type="checkbox" checked={singleGroup||value.group.includes(group)} disabled={singleGroup} onChange={e=>toggleGroup(group,e.target.checked)}/><i className="fleet-cost-centre-swatch" style={{backgroundColor:costCentreColour(group)}} aria-hidden="true"/><span>{group} ({machines.filter(m=>(m.assetGroup??'Unmatched')===group).length})</span></label>)}</div></fieldset>
 </div><div className="fleet-preferences-footer"><button onClick={()=>onChange({...defaults,yard:true})}>Reset filters</button></div></section>;
}
