import Link from "next/link";
import {redirect} from "next/navigation";
import {getAdminUser} from "../../../../../lib/auth";
import {ownerGroupArchive,groupArchiveEnabled} from "../../../../../lib/groupOrderArchive";
import styles from "../../../../components/damageAdmin.module.css";
export const dynamic="force-dynamic";
export const metadata={title:"Ordredokumenter – Aadland Utleie",robots:{index:false,follow:false}};
const kr=n=>n===null?"Ikke dokumentert":new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(n/100);
export default async function Page({params}){
 const user=await getAdminUser();if(!user)redirect("/admin/login");if(user.role!=="owner")redirect("/admin");
 const {id}=await params,data=groupArchiveEnabled()?await ownerGroupArchive(id):null;
 if(!data)return <main className={styles.panel}><Link href="/admin/utleie/ordrer">← Ordrer</Link><h1>Dokumentarkiv</h1><p>Arkivet er ikke aktivert eller ordregrunnlaget kunne ikke bekreftes.</p></main>;
 const a=data.accounting;
 return <main className={styles.panel}><Link href="/admin/utleie/ordrer">← Ordrer</Link><header><small>AADLAND UTLEIE</small><h1>Dokumentarkiv – ordre {data.orderNumber}</h1></header>
 <div className={styles.card}><h2>Avtale og signering</h2>{data.agreementId?<p><a href={"/api/admin/signing/"+data.agreementId+"/avtale"}>Last ned leieavtale (PDF)</a></p>:<p>Ingen avtale registrert.</p>}{data.signed&&<p><a href={"/api/admin/signing/"+data.agreementId+"/bevis"}>Last ned signeringsbevis (PDF)</a></p>}</div>
 <div className={styles.card}><h2>Bankbilag – depositum</h2>{data.documents.map(d=><div key={d.kind+d.digest}><p>{d.kind==="deposit"?"Mottatt depositum":"Tilbakebetaling"} · {kr(d.amountOre)} · {d.reference} · {d.used?"Knyttet til registrert oppgjør":"Opplastet, ikke knyttet til oppgjør"}</p><a href={d.url}>Last ned dokumentbilde</a></div>)}{!data.documents.length&&<p>Ingen bankbilder lastet opp.</p>}<p>Bildene er bearbeidede kopier, ikke automatisk bankverifisering.</p></div>
 <div className={styles.card}><h2>Regnskapsgrunnlag – utkast</h2><p>Referanse: {a.reference}</p>{a.lines.map((l,i)=><p key={i}>{l.kind==="rental"?"Leie":"Varesalg"} · {l.description} · {l.quantity} stk · {kr(l.grossOre)}</p>)}<p>Sum inkl. mva: {kr(a.grossOre)}</p><p>Foreløpig mva (forutsatt 25 %): {kr(a.vatOre)} · eks. mva: {kr(a.netOre)}</p><p>Leiebetaling: {a.captureRecorded?"Registrert trukket, ikke fersk avstemming":"Ikke bekreftet trukket"}</p><h3>Depositum – separat</h3><p>Forventet {kr(a.depositExpectedOre)} · dokumentert registrering {kr(a.depositRecordedOre)} · tilbakebetalt {kr(a.refundRecordedOre)} · beholdt {kr(a.retainedRecordedOre)}</p><p>Ikke klar for bokføring. Kontroller mva-status, kontoplan, gebyrer, bankoppgjør, tidspunkt og skadekrav før Tripletex. Ingen data er sendt.</p></div></main>;
}
