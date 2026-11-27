import Link from "next/link";
import {redirect} from "next/navigation";
import {getAdminUser} from "../../../../../lib/auth";
import {groupFollowupEnabled,ownerGroupFollowup} from "../../../../../lib/groupExpiry";
export const dynamic="force-dynamic";
export const metadata={title:"Betalinger til oppfølging",robots:{index:false,follow:false}};
const labels={review:"Ordre må kontrolleres",payment_review:"Betaling må avklares",expiry_review:"Utløpskontroll krever gjennomgang",expiry_waiting:"Avventer utløpskontroll"};
const date=v=>new Intl.DateTimeFormat("nb-NO",{dateStyle:"short",timeStyle:"short",timeZone:"Europe/Oslo"}).format(new Date(v));
export default async function Page(){
 const user=await getAdminUser();if(!user)redirect("/admin/login");if(user.role!=="owner")redirect("/admin");
 const enabled=groupFollowupEnabled(),data=enabled?await ownerGroupFollowup():null;
 return <main style={{maxWidth:900,margin:"auto",padding:16}}><Link href="/admin/utleie/ordrer">← Ordrer</Link><h1>Betalinger og reservasjoner til oppfølging</h1><p>Kun ordregrunnlag fra databasen. Ingen betaling er kontrollert hos Vipps på denne siden. Uavklart betaling frigjøres ikke automatisk.</p>
 {!enabled?<p>Oppfølging er ikke aktivert.</p>:!data?<p role="alert">Oppfølgingsgrunnlaget kunne ikke bekreftes.</p>:<><p><strong>{data.total}</strong> til oppfølging · Betaling/kontroll: {data.paymentReview} · Feil i utløpskontroll: {data.expiryReview} · Avventer utløp: {data.waiting}</p>{data.total>50&&<p role="alert">Viser første 50 av {data.total}. Listen er ikke fullstendig.</p>}{!data.total&&<p>Ingen ordre med disse oppfølgingsstatusene.</p>}{data.rows.map(r=><div key={r.id} style={{border:"1px solid currentColor",borderRadius:12,padding:16,marginBottom:12}}><strong>Ordre {r.number}</strong><p>{labels[r.reason]} · Frist {date(r.expires_at)}</p>{r.checked_at&&<p>Siste utløpskontroll: {date(r.checked_at)}</p>}<Link className="btn alt" href={"/admin/utleie/ordrer/"+r.id}>Åpne ordredokumenter</Link></div>)}</>}
 </main>;
}
