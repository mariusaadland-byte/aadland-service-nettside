import assert from "node:assert/strict";
import {validGroupFollowup,runGroupExpiry} from "../lib/groupExpiry.mjs";
const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",id2="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const x={total:1,paymentReview:1,expiryReview:0,waiting:0,rows:[{id,number:"1",status:"payment_pending",expires_at:"2026-11-28T00:00:00Z",payable_ore:50000,checked_at:null,reason:"payment_review"}]};
assert.equal(validGroupFollowup(x),x);assert.equal(validGroupFollowup({...x,total:2}),null);
const r=await runGroupExpiry({store:{candidates:async()=>[{group_id:id},{group_id:id2}],attempt:async x=>{if(x===id)return "released";throw Error("unknown");}}});
assert.deepEqual(r,{selected:2,released:1,review:0,skipped:0,unconfirmed:1});
await assert.rejects(runGroupExpiry({store:{candidates:async()=>[{group_id:id},{group_id:id}],attempt:async()=>{throw Error("must not run");}}}));
console.log("U40H expiry worker and owner snapshot validation passed");
