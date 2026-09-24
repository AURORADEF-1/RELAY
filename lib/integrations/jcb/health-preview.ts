import { assessMachine } from "./health";
import type { JcbFault, LinkedJcbMachine } from "./types";
export const PREVIEW_NOW=Date.parse("2026-09-24T10:00:00Z");
const today="2026-09-24T09:15:00Z";
function machine(id:string,model:string,fuel=65,positionAt=today):LinkedJcbMachine{return {pin:`DEMO-${id}`,equipmentId:id,model,relay:{id:`demo-${id}`,machine_number:id,serial_number:`DEMO-${id}`,make:"JCB",model},match:"exact",position:{latitude:52.4,longitude:1.1,at:positionAt},fuel:{value:fuel,at:today},hours:{value:1230,at:today}};}
export const PREVIEW_FAULTS:JcbFault[]=[{code:"DEMO-101",description:"Engine coolant temperature reported above normal range",severity:"Major",at:today},{code:"DEMO-204",description:"Sensor signal outside expected range",severity:"Minor",at:"2026-09-23T13:30:00Z"}];
export const PREVIEW_ROWS=[assessMachine(machine("DEMO 01","540-140 HiVis"),PREVIEW_FAULTS,false,PREVIEW_NOW),assessMachine(machine("DEMO 02","535-95",12),[],false,PREVIEW_NOW),assessMachine(machine("DEMO 03","542-70 NGC",78,"2026-09-10T05:00:00Z"),[],false,PREVIEW_NOW),assessMachine(machine("DEMO 04","531-70"),[{code:"DEMO-305",description:"Historic electrical supply warning",severity:"Minor",at:"2026-08-12T12:00:00Z"}],false,PREVIEW_NOW),assessMachine(machine("DEMO 05","525-60"),[],false,PREVIEW_NOW),assessMachine(machine("DEMO 06","3CX"),[],true,PREVIEW_NOW)];
