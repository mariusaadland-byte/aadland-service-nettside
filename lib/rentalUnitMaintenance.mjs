import {rentalUnitId} from "./rentalUnitQr.mjs";
export const maintenanceKinds={inspection:"Kontroll",service:"Service",repair:"Reparasjon",fault:"Feil eller skade"};
export const maintenanceConditions={ok:"Kontrollert – i orden",follow_up:"Krever oppfølging",out_of_service:"Skal ikke brukes"};
export function validMaintenanceDate(s){
 if(typeof s!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
 const d=new Date(s+"T12:00:00Z");
 return Number.isFinite(+d)&&d.toISOString().slice(0,10)===s;
}
export function maintenanceInput(b,today){
 if(!rentalUnitId(b?.unitId)||!rentalUnitId(b?.requestId)||!Object.hasOwn(maintenanceKinds,b.kind)||!Object.hasOwn(maintenanceConditions,b.condition)||!validMaintenanceDate(b.performedOn)||b.performedOn>today||typeof b.note!=="string"||b.note.trim().length<10||b.note.trim().length>2000)return null;
 const next=b.nextDueOn===""||b.nextDueOn===null?null:b.nextDueOn;
 if(next!==null&&(!validMaintenanceDate(next)||next<b.performedOn))return null;
 return {id:b.requestId.toLowerCase(),unit_id:b.unitId.toLowerCase(),kind:b.kind,condition:b.condition,performed_on:b.performedOn,next_due_on:next,note:b.note.trim()};
}
export function sameMaintenanceEvent(a,b){
 return !!a&&["id","unit_id","kind","condition","performed_on","next_due_on","note"].every(k=>a[k]===b[k]);
}
export function maintenanceDueLabel(date,today){
 if(!validMaintenanceDate(date))return "Ingen ny kontrolldato registrert";
 return date<today?"Kontrollfrist passert":date===today?"Kontroll i dag":"Neste kontroll: "+date;
}
