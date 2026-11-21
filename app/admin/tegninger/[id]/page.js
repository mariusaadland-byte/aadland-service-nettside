import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {getAdminUser} from "../../../../lib/auth";
import {canReadProjectDrawings,canEditProjectDrawings} from "../../../../lib/projectDrawingPermissions";
import {db} from "../../../../lib/supabase";
import CustomerDrawingViewer from "../../../min-side/CustomerDrawingViewer";

export const dynamic="force-dynamic";
export const metadata={title:"Vis prosjekttegning | Aadland Service",robots:{index:false,follow:false}};
const uuid=v=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

export default async function ReadOnlyDrawingPage({params}){
 const admin=await getAdminUser();
 if(!admin)redirect("/admin/login");
 if(!canReadProjectDrawings(admin))redirect("/admin");
 const resolved=await params;
 const id=String(resolved?.id||"");
 if(!uuid(id))notFound();
 const s=db();
 if(!s)throw new Error("Tegningslageret er ikke tilgjengelig.");
 const {data,error}=await s.from("project_drawings")
  .select("id,name,customer,address,notes,drawing_data,updated_at,order_id")
  .eq("id",id).maybeSingle();
 if(error)throw new Error("Kunne ikke åpne tegningen.");
 if(!data)notFound();
 const canEdit=canEditProjectDrawings(admin);
 const drawing={drawingData:data.drawing_data&&typeof data.drawing_data==="object"?data.drawing_data:{}};
 return <main style={{maxWidth:1200,margin:"0 auto",padding:"20px 14px 72px",minHeight:"100vh"}}>
  <nav style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap",marginBottom:18}}>
   <Link href="/admin/tegninger">← Til tegningsarkivet</Link>
   {canEdit&&<Link href={"/admin/tegning?drawingId="+encodeURIComponent(id)}
    style={{padding:"10px 15px",background:"#201f1c",color:"#fff",borderRadius:9,textDecoration:"none"}}>Rediger tegning</Link>}
  </nav>
  <section style={{background:"#fff",color:"#24211e",padding:"20px",borderRadius:14,border:"1px solid #ddd6c9"}}>
   <p style={{fontSize:12,fontWeight:800,letterSpacing:".06em",color:"#72572d",margin:"0 0 7px"}}>PROSJEKTTEGNING · VISNING</p>
   <h1 style={{margin:"0 0 9px",fontSize:"clamp(25px,4vw,36px)"}}>{data.name||"Tegning"}</h1>
   <p style={{margin:"0 0 9px"}}>{[data.customer,data.address].filter(Boolean).join(" · ")||"Uten kundeadresse"}</p>
   <p style={{fontSize:13,color:"#695f55",margin:"0 0 18px"}}>{canEdit?
    "Dette er en visning av den lagrede tegningen. Bruk «Rediger tegning» for å gjøre endringer.":
    "Du har bare lesetilgang. Du kan se plantegning og 3D, men ikke lagre, endre eller slette denne tegningen."}</p>
   <CustomerDrawingViewer drawing={drawing}/>
   {data.notes&&<section style={{marginTop:18,padding:12,background:"#f6f2ea",borderRadius:8}}>
    <h2 style={{fontSize:16,margin:"0 0 6px"}}>Tegningsnotat</h2>
    <p style={{whiteSpace:"pre-wrap",margin:0}}>{data.notes}</p>
   </section>}
  </section>
 </main>;
}
