import assert from "node:assert/strict";
import {reconcileGroupPayment,groupPaymentDraftStore} from "../lib/groupPaymentBridge.mjs";
const id="00000000-0000-4000-8000-000000000001",ref="AUG-"+id,group={id,status:"payment_pending",payment_reference:ref,payable_ore:30000};
const amount=value=>({currency:"NOK",value}),payment={reference:ref,pspReference:"demo-psp",amount:amount(30000),state:"AUTHORIZED",aggregate:{authorizedAmount:amount(30000),cancelledAmount:amount(0),capturedAmount:amount(30000),refundedAmount:amount(0)}};
let calls=0;const store=groupPaymentDraftStore({rpc:async(name,args)=>{calls++;assert.equal(name,"draft_group_payment_confirm");assert.equal(args.p_captured,30000);return {data:"confirmed"}}});
assert.equal((await reconcileGroupPayment({group,payment,store})).status,"confirmed");
assert.equal((await reconcileGroupPayment({group,payment:{...payment,aggregate:{...payment.aggregate,capturedAmount:amount(0)}},store})).status,"authorized_not_captured");
assert.equal(calls,1);console.log("U-39D group payment bridge and confirmation gating passed");
