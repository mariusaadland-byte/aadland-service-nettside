import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../../lib/auth";
import {db} from "../../../../../../lib/supabase";
import {readMaterialImportStatus} from "../../../../../../lib/materialImportWorkflow";
export const dynamic="force-dynamic";
export async function GET(req){
 const user=await getAdminUser();
 if(!user||user.role!=="owner")return NextResponse.json({error:"Kun eier kan kontrollere prisimport."},{status:403,headers:{"Cache-Control":"private, no-store"}});
 const s=db();if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
 return readMaterialImportStatus(s,user,new URL(req.url).searchParams.get("previewId"));
}
