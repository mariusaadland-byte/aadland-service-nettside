// A direct Vipps sale is treated as work delivered on the invoice day.
// Only *drafts* may auto-date. Issued invoice delivery dates are immutable.
export function vippsDeliveryDate(invoice,today){
 if(invoice?.status!=="draft"||invoice?.customer?.paymentMethod!=="vipps")return invoice?.customer?.workDate||"";
 return today;
}
export function withVippsDeliveryDate(invoice,today){
 if(invoice?.status!=="draft"||invoice?.customer?.paymentMethod!=="vipps")return invoice;
 return {...invoice,customer:{...(invoice.customer||{}),workDate:today}};
}
