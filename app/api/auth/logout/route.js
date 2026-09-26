import {sameOriginGuard} from "../../../../lib/requestGuard";
import {NextResponse} from "next/server";import {clearAdminCookie} from "../../../../lib/auth";export async function POST(req){
 const originError=sameOriginGuard(req); if(originError)return originError;await clearAdminCookie();return NextResponse.json({ok:true})}