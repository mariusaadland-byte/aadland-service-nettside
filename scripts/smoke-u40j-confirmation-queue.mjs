import assert from "node:assert/strict";
import {runConfirmationQueue,validConfirmationSnapshot} from "../lib/rentalConfirmationQueue.mjs";
const id="00000000-0000-4000-8000-000000000001",id2="00000000-0000-4000-8000-000000000002";
const r=await runConfirmationQueue({candidates:async()=>[{group_id:id},{group_id:id2}],send:async x=>x===id?{status:"accepted"}:{status:"review"}});
assert.deepEqual(r,{selected:2,accepted:1,review:1,skipped:0,unconfirmed:0});
await assert.rejects(runConfirmationQueue({candidates:async()=>[{group_id:id},{group_id:id}],send:async()=>{throw Error("must not run")}}));
const x={pending:0,claimed:0,stale:1,review:0,accepted:0,rows:[{group_id:id,number:"1",display_state:"stale",created_at:"2026-11-28T00:00:00Z",claimed_at:"2026-11-28T00:01:00Z"}]};
assert.equal(validConfirmationSnapshot(x),x);assert.equal(validConfirmationSnapshot({...x,stale:2}),null);
console.log("U40J queue and stale claim monitoring passed");
