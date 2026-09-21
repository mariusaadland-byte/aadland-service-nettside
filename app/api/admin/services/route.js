import { NextResponse } from "next/server";
import { getAdminUser, hasPermission } from "../../../../lib/auth";
import { db, fromDbService } from "../../../../lib/supabase";

async function requireAccess() {
  const currentUser = await getAdminUser();
  if (!currentUser) return { error: NextResponse.json({ error: "Ikke innlogget." }, { status: 401 }) };
  if (!(await hasPermission("canManageProducts"))) return { error: NextResponse.json({ error: "Du har ikke tilgang til å administrere tjenester." }, { status: 403 }) };
  return { currentUser };
}
const text = v => String(v || "").trim();
const slugify = v => text(v).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/æ/g,"ae").replace(/ø/g,"o").replace(/å/g,"a").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
function payload(b) {
  return {
    title:text(b.title), description:text(b.description)||null, image_url:text(b.imageUrl)||null,
    kind:text(b.kind)||"service", active:b.active!==false, show_on_home:b.showOnHome!==false,
    show_in_menu:b.showInMenu!==false, show_in_footer:b.showInFooter!==false, has_page:b.hasPage===true,
    cta_label:text(b.ctaLabel)||"Les mer", cta_href:text(b.ctaHref)||null,
    form_title:text(b.formTitle)||"Be om befaring", form_prompt:text(b.formPrompt)||"Beskriv kort hva du ønsker hjelp med.",
    publish_from:b.publishFrom||null, publish_until:b.publishUntil||null,
    sort_order:Number.isFinite(Number(b.sortOrder))?Math.round(Number(b.sortOrder)):0
  };
}
export async function GET() {
  const a=await requireAccess(); if(a.error)return a.error; const s=db();if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
  const {data,error}=await s.from("services").select("*").order("sort_order",{ascending:true}).order("created_at",{ascending:true});
  if(error)return NextResponse.json({error:"Tjenestene kunne ikke hentes."},{status:500});
  return NextResponse.json({services:(data||[]).map(fromDbService)});
}
export async function POST(req) {
  const a=await requireAccess(); if(a.error)return a.error; const b=await req.json(); const p=payload(b);
  if(!p.title)return NextResponse.json({error:"Tjenesten må ha et navn."},{status:400});
  p.slug=slugify(b.slug||p.title)+"-"+Date.now();const s=db();if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
  const {data,error}=await s.from("services").insert(p).select("*").single();
  if(error){console.error("SERVICE CREATE ERROR:",error);return NextResponse.json({error:"Tjenesten kunne ikke opprettes."},{status:500});}
  return NextResponse.json({ok:true,service:fromDbService(data)});
}
export async function PATCH(req) {
  const a=await requireAccess(); if(a.error)return a.error; const b=await req.json();
  if(!b.id)return NextResponse.json({error:"Tjeneste mangler."},{status:400});
  const p=payload(b); if(!p.title)return NextResponse.json({error:"Tjenesten må ha et navn."},{status:400});
  p.updated_at=new Date().toISOString();const s=db();if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
  const {data,error}=await s.from("services").update(p).eq("id",b.id).select("*").single();
  if(error){console.error("SERVICE UPDATE ERROR:",error);return NextResponse.json({error:"Tjenesten kunne ikke lagres."},{status:500});}
  return NextResponse.json({ok:true,service:fromDbService(data)});
}
export async function DELETE(req) {
  const a=await requireAccess(); if(a.error)return a.error; const b=await req.json();
  if(!b.id)return NextResponse.json({error:"Tjeneste mangler."},{status:400});const s=db();if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
  const {error}=await s.from("services").delete().eq("id",b.id);
  if(error)return NextResponse.json({error:"Tjenesten kunne ikke slettes."},{status:500});
  return NextResponse.json({ok:true});
}
