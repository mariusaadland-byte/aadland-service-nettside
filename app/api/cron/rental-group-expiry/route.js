import {NextResponse} from "next/server";
import {cronGuard} from "../../../../lib/cronAuth";
import {groupExpiryCronEnabled,runGroupExpiryCron} from "../../../../lib/groupExpiry";
export const runtime="nodejs";
export const maxDuration=60;
// No entry in vercel.json until explicit rollout; never active in preview.
export async function GET(req){
 const denied=cronGuard(req);if(denied)return denied;
 const headers={"Cache-Control":"no-store"};
 if(!groupExpiryCronEnabled())return NextResponse.json({status:"disabled"},{headers});
 try{const result=await runGroupExpiryCron();return NextResponse.json({status:result.unconfirmed?"unconfirmed":"ok",...result},{status:result.unconfirmed?503:200,headers});}
 catch{return NextResponse.json({status:"unconfirmed"},{status:503,headers});}
}
