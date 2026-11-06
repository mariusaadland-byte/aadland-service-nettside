import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

// Test the real server eligibility expression without any database writes, mail or Vipps requests.
const api=readFileSync("app/api/admin/rental-bookings/route.js","utf8");
const match=api.match(/const completedSettled=current\.status==="completed"[\s\S]*?const unresolvedDeposit=/);
assert.ok(match,"Rental archiving must distinguish settled completed rentals from outstanding debts");
const check=new Function("current","captured","refunded","reserved",
  match[0].replace(/const unresolvedDeposit=$/,"")+"\nreturn unresolvedPayment;");
const booked=(x={})=>({
 status:"completed",payment_status:"paid",payment_cancelled_at:null,total_ore:12000,...x
});
assert.equal(check(booked(),12000,0,12000),false,
 "Fully captured completed rental can be archived; historical capture remains intact");
assert.equal(check(booked(),12000,0,0),false,"Already captured payment needs no further reservation release");
assert.equal(check(booked(),8000,0,12000),true,"Partial authorization/collection must not disappear");
assert.equal(check(booked({payment_status:"authorized"}),0,0,12000),true,"Pending reservations must remain visible");
assert.equal(check(booked({status:"cancelled"}),12000,0,12000),true,"Cancelled but charged rental needs settlement/refund");
assert.equal(check(booked(),12000,1000,12000),true,"Partially refunded completed rental needs review");
assert.equal(check(booked({status:"active"}),12000,0,12000),true,"Active rentals cannot hide a live payment");

const ui=readFileSync("app/admin/AdminClient.js","utf8");
assert.ok(ui.includes('const completedSettled=booking.status==="completed"'),
 "Client must allow the same finalized bookings as the server");
assert.ok(ui.includes("(reserved>captured&&!booking.paymentCancelledAt)"),
 "Client must not mistake an already captured reservation for an open one");
assert.ok(api.includes('patch.status="cancelled"'),
 "Archiving a pristine new booking still releases inventory capacity");
assert.ok(api.includes('archived_at:new Date().toISOString()'),
 "Archive only sets reversible metadata, not a SQL payment deletion");
console.log("Utleieopprydding: oppgjorte bookinger kan arkiveres; åpne beløp og reservasjoner forblir sperret.");
