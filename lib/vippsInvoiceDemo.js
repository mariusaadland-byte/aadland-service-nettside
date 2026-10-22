// Local-only admin demo. No Vipps API, database or email dependency.
export const DEMO_MIN_ORE=100;
export const DEMO_MAX_ORE=100000000;
export const DEMO_START_ORE=125000;

export function createVippsDemo(amountOre=DEMO_START_ORE){
 if(!Number.isSafeInteger(amountOre)||amountOre<DEMO_MIN_ORE||amountOre>DEMO_MAX_ORE)throw Error("Skriv inn et beløp mellom 1 og 1 000 000 kroner.");
 return {amountOre,capturedOre:0,refundedOre:0,state:"idle",receiptState:"none"};
}

export function vippsDemoTotals(demo){
 const capturedOre=demo.capturedOre;
 const refundedOre=demo.refundedOre;
 const netOre=Math.max(0,capturedOre-refundedOre);
 return {amountOre:demo.amountOre,capturedOre,refundedOre,netOre,
  outstandingOre:Math.max(0,demo.amountOre-netOre),fullyPaid:netOre>=demo.amountOre};
}

export function canRunVippsDemo(demo,action){
 const net=demo.capturedOre-demo.refundedOre;
 switch(action){
  case "start":return demo.state==="idle";
  case "partial":return demo.state==="pending"&&demo.amountOre>=200;
  case "full":return (demo.state==="pending"||demo.state==="partial")&&demo.refundedOre===0;
  case "cancel":return demo.state==="pending";
  case "refund-part":return (demo.state==="paid"||demo.state==="partial")&&net>=2;
  case "refund-all":return (demo.state==="paid"||demo.state==="partial")&&net>0;
  case "receipt-error":return demo.capturedOre>0&&demo.receiptState==="pending";
  case "receipt-sent":return demo.capturedOre>0&&demo.refundedOre<demo.capturedOre&&["pending","failed"].includes(demo.receiptState);
  case "reset":return true;
  default:return false;
 }
}

export function advanceVippsDemo(demo,action){
 if(!canRunVippsDemo(demo,action))return demo;
 switch(action){
  case "start":return {...demo,state:"pending"};
  case "partial":{
   const amount=Math.min(demo.amountOre-1,Math.max(1,Math.round(demo.amountOre*0.4)));
   return {...demo,state:"partial",capturedOre:amount,receiptState:"pending"};
  }
  case "full":return {...demo,state:"paid",capturedOre:demo.amountOre,receiptState:"pending"};
  case "cancel":return {...demo,state:"cancelled"};
  case "refund-part":{
   const currentNet=demo.capturedOre-demo.refundedOre;
   const refundAmount=Math.min(currentNet-1,Math.max(1,Math.round(currentNet/2)));
   return {...demo,refundedOre:demo.refundedOre+refundAmount,state:"partial"};
  }
  case "refund-all":return {...demo,refundedOre:demo.capturedOre,state:"refunded"};
  case "receipt-error":return {...demo,receiptState:"failed"};
  case "receipt-sent":return {...demo,receiptState:"sent"};
  case "reset":return createVippsDemo(demo.amountOre);
  default:return demo;
 }
}
