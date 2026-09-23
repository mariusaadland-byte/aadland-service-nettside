import {NextResponse} from "next/server";

export const dynamic="force-dynamic";

export async function GET(){
 return NextResponse.json({
  resendConfigured:Boolean(process.env.RESEND_API_KEY),
  vercelEnv:process.env.VERCEL_ENV||null,
  branch:process.env.VERCEL_GIT_COMMIT_REF||null,
  commit:process.env.VERCEL_GIT_COMMIT_SHA||null
 },{
  headers:{"Cache-Control":"no-store, max-age=0"}
 });
}
