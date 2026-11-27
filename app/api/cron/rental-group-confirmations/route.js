import {NextResponse} from "next/server";
import {cronGuard} from "../../../../lib/cronAuth";
import {rentalConfirmationQueueEnabled,runRentalConfirmationQueue} from "../../../../lib/rentalGroupConfirmationEmail";
export const runtime="nodejs";
export const maxDuration=60;
// Not registered in vercel.json. Explicit rollout required.
export async function GET(req){
 const denied=cronGuard(req);if(denied)return denied;
 const headers={"Cache-Control":"no-store"};
 if(!rentalConfirmationQueueEnabled())return NextResponse.json({status:"disabled"},{headers});
 try{const r=await runRentalConfirmationQueue();return NextResponse.json({status:r.unconfirmed?"unconfirmed":r.review?"review":"ok",...r},{status:r.unconfirmed?503:r.review?207:200,headers});}
 catch{return NextResponse.json({status:"unconfirmed"},{status:503,headers});}
}
