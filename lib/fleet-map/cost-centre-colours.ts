const colours:Record<string,string>={
 'Hydraulic Services':'#8b5cf6','Non Shared':'#808000',Operators:'#2563eb',Plant:'#ef4444',
 'Plant Office':'#64748b',Stock:'#eab308',Transport:'#f97316',Workshop:'#ec4899',Yard:'#38bdf8',Unmatched:'#94a3b8',
};
const fallback=['#2563eb','#16a34a','#dc2626','#9333ea','#ca8a04','#0891b2','#c026d3','#4f46e5'];
export function costCentreColour(group:string|null|undefined){
 const name=group?.trim()||'Unmatched';if(colours[name])return colours[name];
 let hash=0;for(const character of name)hash=(hash*31+character.charCodeAt(0))>>>0;
 return fallback[hash%fallback.length];
}
