// Mirror the credit-note database quantity guard in the invoice archive UI.
// The server remains authoritative when two users edit the same invoice.
export function invoiceCreditRemainingQuantities(invoiceLines,creditNotes){
 return (invoiceLines||[]).map((line,index)=>{
  const original=Number(line.quantity||0);
  const previous=(creditNotes||[]).reduce((total,note)=>total+
   (note.lines||[]).reduce((sum,item)=>sum+(Number(item.sourceIndex)===index?
    Number(item.quantity||0):0),0),0);
  return Math.max(0,Math.round((original-previous)*1000)/1000);
 });
}
