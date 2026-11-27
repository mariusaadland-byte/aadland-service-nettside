import {validCostUnit} from "./purchaseCostAllocation.mjs";
const uuid=s=>typeof s==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
export function costHistoryInput(b){
 if(!uuid(b?.id)||!uuid(b.requestId)||!Number.isSafeInteger(b.expectedRevision)||b.expectedRevision<0||b.expectedRevision>=2147483647||!validCostUnit(b.unit)||typeof b.reason!=="string"||b.reason.trim().length<3||b.reason.trim().length>300||b.confirmed!==true)return null;
 return {id:b.id,expectedRevision:b.expectedRevision,unit:b.unit,reason:b.reason.trim(),requestId:b.requestId};
}
export function costHistoryRows(rows,year){
 if(!Array.isArray(rows)||rows.length>500||!Number.isInteger(year)||year<2000||year>2100)return null;
 const seen=new Set(),out=[];
 for(const x of rows){
  const base=Number(x.base_ore),vat=Number(x.vat_ore);
  if(!uuid(x.id)||seen.has(x.id)||x.voided_at||typeof x.document_date!=="string"||x.document_date.slice(0,4)!==String(year)||!["purchase","credit"].includes(x.kind)||!Number.isSafeInteger(base)||base<=0||!Number.isSafeInteger(vat)||vat<0||!Number.isSafeInteger(base+vat)||x.cost_unit!==null&&!validCostUnit(x.cost_unit)||!Number.isSafeInteger(x.cost_revision)||x.cost_revision<0)return null;
  seen.add(x.id);out.push({id:x.id,date:x.document_date,supplier:x.supplier_name,number:x.supplier_document_number,kind:x.kind,grossOre:(x.kind==="credit"?-1:1)*(base+vat),unit:x.cost_unit,revision:x.cost_revision});
 }
 return out;
}
