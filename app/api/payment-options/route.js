import {NextResponse} from "next/server";
import {db} from "../../../lib/supabase";
import {vippsUnitReadiness} from "../../../lib/vippsReadiness";

export const runtime="nodejs";

export async function GET(){
 const s=db();
 const [service,rental]=await Promise.all([
  vippsUnitReadiness(s,"service"),
  vippsUnitReadiness(s,"rental")
 ]);
 return NextResponse.json({
  vipps:{
   service:service.ready===true,
   rental:rental.ready===true
  }
 });
}
