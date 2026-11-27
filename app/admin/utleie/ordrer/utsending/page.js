import Link from "next/link";
import {redirect} from "next/navigation";
import {getAdminUser} from "../../../../../lib/auth";
import {rentalConfirmationAdminEnabled,rentalConfirmationSnapshot} from "../../../../../lib/rentalGroupConfirmationEmail";
export const dynamic="force-dynamic";
export const metadata={title:"Ordrebekreftelser – Aadland Utleie",robots:{index:false,follow:false}};
const labels={pending:"Venter på utsending",claimed:"Utsending påbegynt",stale:"Utsending uavklart – kontroller Resend",review:"Krever manuell kontroll"};
export default async function Page(){
 const user=await getAdminUser();if(!user)redirect("/admin/login");if(user.role!=="owner")redirect("/admin");
 const enabled=rentalConfirmationAdminEnabled(),x=enabled?await rentalConfirmationSnapshot():null;
 return <main style={{maxWidth:900,margin:"auto",padding:16}}><Link href="/admin/utleie/ordrer">← Ordrer</Link><h1>Ordrebekreftelser og betalingsbekreftelser</h1><p>Avsender: noreply@aadlandutleie.no. Godkjent av Resend betyr ikke nødvendigvis levert i kundens innboks. Usikre utsendinger skal ikke sendes på nytt automatisk.</p>
 {!enabled?<p>Utsendingsoversikten er ikke aktivert.</p>:!x?<p role="alert">Utsendingsstatus kunne ikke bekreftes.</p>:<><p>Venter: {x.pending} · Påbegynt: {x.claimed} · Uavklart: {x.stale+x.review} · Godkjent av Resend: {x.accepted}</p>{x.pending+x.claimed+x.stale+x.review>50&&<p role="alert">Viser de første 50 av alle åpne saker.</p>}{!x.rows.length&&<p>Ingen åpne utsendinger.</p>}{x.rows.map(r=><div key={r.group_id} style={{border:"1px solid currentColor",borderRadius:12,padding:16,marginBottom:12}}><strong>Ordre {r.number}</strong><p>{labels[r.display_state]}</p><Link className="btn alt" href={"/admin/utleie/ordrer/"+r.group_id}>Åpne ordredokumenter</Link></div>)}</>}
 </main>;
}
