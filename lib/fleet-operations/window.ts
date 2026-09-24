// Reporting begins at UK midnight on the agreed launch date, not a rolling lookback.
export const REPORTING_LAUNCH = Date.parse('2026-09-24T00:00:00+01:00');
const london = new Intl.DateTimeFormat('en-GB', {timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
function parts(at:number){return Object.fromEntries(london.formatToParts(at).map(p=>[p.type,Number(p.value)]));}
function midnight(year:number,month:number,day:number){
 const target=Date.UTC(year,month-1,day);let at=target;
 for(let i=0;i<3;i++){const p=parts(at);at+=target-Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);}
 return at;
}
export function reportingWindow(now:number,days:number){
 if(!Number.isFinite(now)||![1,7,30].includes(days))throw new Error('Invalid reporting window');
 const p=parts(now),startDay=new Date(Date.UTC(p.year,p.month-1,p.day-(days-1)));
 const from=Math.max(REPORTING_LAUNCH,midnight(startDay.getUTCFullYear(),startDay.getUTCMonth()+1,startDay.getUTCDate()));
 return {from,to:now,cycleEndsAt:midnight(p.year,p.month,p.day+1),launchAt:REPORTING_LAUNCH};
}
