import "server-only";
import {db} from "./supabase";
import {rentalFinanceSnapshot} from "./rentalFinanceSnapshot.mjs";
export const rentalFinanceEnabled=()=>process.env.VERCEL_ENV==="production"&&process.env.AADLAND_GROUP_FINANCE_ENABLED==="true"&&process.env.AADLAND_GROUP_ADMIN_ENABLED==="true";
export async function ownerRentalFinance(){
 if(!rentalFinanceEnabled())return null;
 const s=db();if(!s)return null;
 try{const r=await s.rpc("draft_group_finance_snapshot");return r.error?null:rentalFinanceSnapshot(r.data);}catch{return null;}
}
