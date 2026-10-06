'use client';
import {defaults,type Preferences} from '@/lib/fleet-map/preferences';
import {costCentreColour} from '@/lib/fleet-map/cost-centre-colours';
export function MapPreferences({value,onChange,machines=[]}:{value:Preferences;onChange:(p:Preferences)=>void;machines?:import('@/lib/integrations/jcb/types').LinkedJcbMachine[]}){
 const set=(patch:Partial<Preferences>)=>onChange({...value,...patch});
 const groups=[...new Set([...machines.map(m=>m.assetGroup??'Unmatched'),...value.group])].sort();
 const toggleGroup=(group:string,checked:boolean)=>set({group:checked?[...value.group,group]:value.group.filter(item=>item!==group)});
 return <details className="fleet-preferences" open><summary>Filters &amp; Map Layers</summary><div className="fleet-filter-grid">
 <fieldset><legend>Geofences</legend><label><input type="checkbox" checked={value.yard} onChange={e=>set({yard:e.target.checked})}/>MLP Yard</label></fieldset>
 <fieldset><legend>Asset groups</legend><div className="fleet-group-checks" role="group" aria-label="Group or department"><label><input type="checkbox" checked={value.group.length===0} onChange={()=>set({group:[]})}/>All groups</label>{groups.map(group=><label key={group}><input type="checkbox" checked={value.group.includes(group)} onChange={e=>toggleGroup(group,e.target.checked)}/><i className="fleet-cost-centre-swatch" style={{backgroundColor:costCentreColour(group)}} aria-hidden="true"/><span>{group} ({machines.filter(m=>(m.assetGroup??'Unmatched')===group).length})</span></label>)}</div></fieldset></div><div className="fleet-preferences-footer"><button onClick={()=>onChange({...defaults})}>Reset filters</button></div></details>;
}
