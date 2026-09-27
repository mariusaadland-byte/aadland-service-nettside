import {NextResponse} from "next/server";
import {vippsPublicStatus} from "../../../../../lib/vipps";

export const dynamic="force-dynamic";

export async function GET(){
 return NextResponse.json(vippsPublicStatus(),{
  headers:{"Cache-Control":"private, no-store, max-age=0"}
 });
}
