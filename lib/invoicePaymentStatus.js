export function invoiceGrossOre(invoice){
 return (invoice.line_items||[]).reduce((sum,line)=>{const net=Math.round(Number(line.quantity||0)*Number(line.unitPriceOre||0));return sum+net+Math.round(net*Number(line.vatRate||0)/100)},0);
}
export function invoiceTotalOre(invoice){return Math.max(0,invoiceGrossOre(invoice)-Math.max(0,Number(invoice?.credited_ore)||0));}
export function invoicePaymentState(invoice,today){
 const gross=invoiceGrossOre(invoice),credited=Math.max(0,Number(invoice?.credited_ore)||0),total=Math.max(0,gross-credited),paid=Math.max(0,Number(invoice.paid_ore)||0),outstanding=Math.max(0,total-paid);
 if(invoice.status==="draft")return {key:"draft",label:"Kladd",total,paid,outstanding,credited,gross};
 if(outstanding===0&&total===0&&credited>0)return {key:"credited",label:"Kreditert",total,paid,outstanding,credited,gross};
 if(outstanding===0)return {key:"paid",label:"Betalt",total,paid,outstanding,credited,gross};
 if(invoice.due_date&&invoice.due_date<today)return {key:"overdue",label:paid>0?"Forfalt – delbetalt":"Forfalt",total,paid,outstanding,credited,gross};
 return {key:paid>0?"partial":"unpaid",label:paid>0?"Delbetalt":"Ubetalt",total,paid,outstanding,credited,gross};
}

/**
 * The exact invoice content the owner sees before confirming a Vipps request.
 * This shape is deliberately stable across draft issuance: invoice number,
 * automatic due date and updated_at can legitimately change during issuance.
 * Financial amounts, customer identity and agreed work/price must not.
 */
export function invoiceVippsConfirmationSnapshot(invoice){
 const str=value=>String(value??"").trim();
 const customer=invoice?.customer||{};
 const totalOre=invoiceTotalOre(invoice);
 return {
  totalOre,
  paidOre:Math.max(0,Number(invoice?.paid_ore)||0),
  creditedOre:Math.max(0,Number(invoice?.credited_ore)||0),
  title:str(invoice?.title),
  notes:str(invoice?.notes),
  pricingModel:str(invoice?.pricing_model),
  customer:{
   name:str(customer.name),
   email:str(customer.email).toLowerCase(),
   address:str(customer.address),
   phone:str(customer.phone),
   workDate:str(customer.workDate),
   workAddress:str(customer.workAddress),
   workDescription:str(customer.workDescription)
  },
  lines:(invoice?.line_items||[]).map(line=>({
   description:str(line.description),
   type:str(line.type),
   unit:str(line.unit),
   quantity:Number(line.quantity||0),
   unitPriceOre:Number(line.unitPriceOre||0),
   vatRate:Number(line.vatRate||0)
  }))
 };
}
