import {sameOriginGuard} from "../../../../lib/requestGuard";
import {NextResponse} from "next/server";import {clearCustomerCookie} from "../../../../lib/customer-auth";export async function POST(req){
 const originError=sameOriginGuard(req); if(originError)return originError;await clearCustomerCookie();return NextResponse.json({ok:true})}