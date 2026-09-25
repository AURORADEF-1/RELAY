export type CollectionState={last_attempt_at:string|null;last_ack_at:string|null;last_error:string|null;last_cycle?:{drained:boolean;latestReceivedAt?:string|null}};
export function collectionHealth(state:CollectionState,now=Date.now()){
 const age=(at?:string|null)=>{const time=at?Date.parse(at):NaN;return Number.isFinite(time)&&time<=now?now-time:null;};
 const checked=age(state.last_ack_at),receipt=age(state.last_cycle?.latestReceivedAt);
 const overdue=checked===null||checked>30*60000;
 const behind=state.last_cycle?.drained===false&&receipt!==null&&receipt>30*60000;
 const warning=overdue||behind||!!state.last_error;
 const message=overdue?'Asset Care+ collection overdue — no successful check within 30 minutes.':behind?'Asset Care+ collection delay exceeds the 30-minute target.':state.last_error?'Asset Care+ collection needs attention.':state.last_cycle?.drained?'Asset Care+ queue checked — no queued readings.':receipt===null?'Asset Care+ collection delay not yet confirmed.':'Asset Care+ catching up — within the 30-minute target.';
 return {warning,message,minutes:receipt===null?null:Math.ceil(receipt/60000)};
}
