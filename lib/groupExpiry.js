import "server-only";
import {db} from "./supabase";
import {validGroupFollowup,runGroupExpiry} from "./groupExpiry.mjs";
export const groupFollowupEnabled=()=>process.env.VERCEL_ENV==="production"&&process.env.AADLAND_GROUP_ADMIN_ENABLED==="true"&&process.env.AADLAND_GROUP_FOLLOWUP_ENABLED==="true";
export const groupExpiryCronEnabled=()=>process.env.VERCEL_ENV==="production"&&process.env.AADLAND_GROUP_EXPIRY_CRON_ENABLED==="true";
const value=r=>{if(r.error)throw Error("EXPIRY_UNCONFIRMED");return r.data;};
export async function ownerGroupFollowup(){
 if(!groupFollowupEnabled())return null;
 const s=db();if(!s)return null;
 try{return validGroupFollowup(value(await s.rpc("draft_group_followup_snapshot")));}catch{return null;}
}
export async function runGroupExpiryCron(){
 if(!groupExpiryCronEnabled())throw Error("DISABLED");
 const s=db();if(!s)throw Error("EXPIRY_UNCONFIRMED");
 return runGroupExpiry({store:{candidates:async()=>value(await s.rpc("draft_group_expiry_candidates")),attempt:async id=>value(await s.rpc("draft_group_expiry_attempt",{p_group:id}))}});
}
