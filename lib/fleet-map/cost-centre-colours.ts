const colours:Record<string,string>={
 'Hydraulic Services':'#0ea5e9','Non Shared':'#64748b',Operators:'#f97316',Plant:'#22c55e',
 'Plant Office':'#a855f7',Stock:'#eab308',Transport:'#ef4444',Workshop:'#14b8a6',Yard:'#ec4899',Unmatched:'#94a3b8',
};
const fallback=['#2563eb','#16a34a','#dc2626','#9333ea','#ca8a04','#0891b2','#c026d3','#4f46e5'];
export function costCentreColour(group:string|null|undefined){
 const name=group?.trim()||'Unmatched';if(colours[name])return colours[name];
 let hash=0;for(const character of name)hash=(hash*31+character.charCodeAt(0))>>>0;
 return fallback[hash%fallback.length];
}
