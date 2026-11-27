import {rentalUnitId} from "./rentalUnitQr.mjs";
const max=2147483647;
const amount=n=>Number.isSafeInteger(n)&&n>=0&&n<=max;
const qty=n=>Number.isInteger(n)&&n>=0&&n<=1000000;
export function saleSnapshot(rows){
 if(!Array.isArray(rows)||rows.length<1||rows.length>20)return null;
 const seen=new Set(),out=[];let grossOre=0;
 for(const r of rows){
  if(!rentalUnitId(r?.id)||typeof r.name!=="string"||!r.name.trim()||r.name.length>120||typeof r.sku!=="string"||!r.sku.trim()||r.sku.length>80||!Number.isInteger(r.quantity)||r.quantity<1||r.quantity>100||!amount(r.unitOre)||r.unitOre===0)return null;
  const id=r.id.toLowerCase();if(seen.has(id))return null;seen.add(id);
  const totalOre=r.unitOre*r.quantity;
  if(!amount(totalOre)||!amount(grossOre+totalOre))return null;
  grossOre+=totalOre;out.push({id,name:r.name,sku:r.sku,quantity:r.quantity,unitOre:r.unitOre,totalOre});
 }
 return {lines:out.sort((a,b)=>a.id.localeCompare(b.id)),grossOre};
}
export function stockTransition({state,event,quantity,onHand,reserved}){
 if(!["none","held","confirmed","released","fulfilled"].includes(state)||!qty(quantity)||quantity===0||!qty(onHand)||!qty(reserved)||reserved>onHand)return null;
 const targets={reserve:"held",confirm:"confirmed",release:"released",fulfill:"fulfilled"};
 const target=targets[event];if(!target)return null;
 if(state===target)return {state,onHand,reserved,changed:false};
 if(event==="reserve"&&state==="none"&&onHand-reserved>=quantity)return {state:target,onHand,reserved:reserved+quantity,changed:true};
 if(reserved<quantity)return null;
 if(event==="confirm"&&state==="held")return {state:target,onHand,reserved,changed:true};
 if(event==="release"&&["held","confirmed"].includes(state))return {state:target,onHand,reserved:reserved-quantity,changed:true};
 if(event==="fulfill"&&state==="confirmed")return {state:target,onHand:onHand-quantity,reserved:reserved-quantity,changed:true};
 return null;
}
// Internal draft only. Not an invoice or an instruction to transfer to Tripletex.
export function rentalSalesInvoiceDraft({orderId,rentalLines,goods,depositOre}){
 if(!rentalUnitId(orderId)||!amount(depositOre)||!Array.isArray(rentalLines)||!rentalLines.length||rentalLines.length>10)return null;
 const sale=saleSnapshot(goods);if(!sale)return null;
 const lines=[];let grossOre=0,netOre=0,vatOre=0;
 function add(kind,description,gross,quantity,sku){
  if(typeof description!=="string"||!description.trim()||description.length>180||!amount(gross)||!amount(grossOre+gross))return false;
  // 25% of net = 20% of gross; round per line in whole ore.
  const vat=Math.round(gross/5),net=gross-vat;
  lines.push({kind,description,quantity,sku,grossOre:gross,netOre:net,vatOre:vat,vatRate:25});
  grossOre+=gross;netOre+=net;vatOre+=vat;return true;
 }
 for(const r of rentalLines){if(!Number.isInteger(r?.quantity)||r.quantity<1||r.quantity>20||!add("rental",r.description,r.grossOre,r.quantity,null))return null;}
 for(const r of sale.lines)if(!add("goods",r.name,r.totalOre,r.quantity,r.sku))return null;
 if(!amount(grossOre+depositOre))return null;
 return {reference:"rental-group:"+orderId.toLowerCase(),lines,grossOre,netOre,vatOre,depositOre,readyToPost:false};
}
