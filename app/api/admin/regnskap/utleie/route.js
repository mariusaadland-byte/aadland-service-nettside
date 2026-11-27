import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {rentalFinanceEnabled,ownerRentalFinance} from "../../../../../lib/rentalFinance";
import {validFinanceYear,rentalYearControl} from "../../../../../lib/sharedFinanceControl.mjs";
export const dynamic="force-dynamic";
const reply=(b,status=200)=>NextResponse.json(b,{status,headers:{"Cache-Control":"private, no-store","X-Robots-Tag":"noindex,nofollow,noarchive"}});
export async function GET(req){
 const user=await getAdminUser();if(user?.role!=="owner")return reply({status:"forbidden"},403);
 const raw=new URL(req.url).searchParams.get("year"),year=Number(raw);
 if(!/^\d{4}$/.test(raw||"")||!validFinanceYear(year))return reply({status:"invalid"},400);
 if(!rentalFinanceEnabled())return reply({status:"disabled",year});
 try{const data=rentalYearControl(await ownerRentalFinance(),year);return data?reply({status:"ok",data}):reply({status:"unconfirmed",year},503);}catch{return reply({status:"unconfirmed",year},503);}
}
