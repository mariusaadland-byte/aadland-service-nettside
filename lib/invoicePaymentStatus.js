export function invoiceTotalOre(invoice){
 return (invoice.line_items||[]).reduce((sum,line)=>{const net=Math.round(Number(line.quantity||0)*Number(line.unitPriceOre||0));return sum+net+Math.round(net*Number(line.vatRate||0)/100)},0);
}
export function invoicePaymentState(invoice,today){
 const total=invoiceTotalOre(invoice),paid=Math.max(0,Number(invoice.paid_ore)||0),outstanding=Math.max(0,total-paid);
 if(invoice.status==="draft")return {key:"draft",label:"Kladd",total,paid,outstanding};
 if(outstanding===0)return {key:"paid",label:"Betalt",total,paid,outstanding};
 if(invoice.due_date&&invoice.due_date<today)return {key:"overdue",label:paid>0?"Forfalt – delbetalt":"Forfalt",total,paid,outstanding};
 return {key:paid>0?"partial":"unpaid",label:paid>0?"Delbetalt":"Ubetalt",total,paid,outstanding};
}
