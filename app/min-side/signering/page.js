import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {getCustomerUserId} from "../../../lib/customer-auth";
import SigningPortalDemo from "../../components/SigningPortalDemo";
import {signingArchiveEnabled} from "../../../lib/signingArchiveConfig";
import {customerSigningArchive} from "../../../lib/customerSigningArchive";
import styles from "../../components/signingPortal.module.css";
export const dynamic="force-dynamic";
export const metadata={title:"Mine avtaler – demo",robots:{index:false,follow:false}};
export default async function Page(){
 const live=signingArchiveEnabled();
 if(!live&&(process.env.NEXT_PUBLIC_SIGNING_PORTAL_DEMO!=="true"||process.env.VERCEL_ENV==="production"))notFound();
 const customerId=await getCustomerUserId();if(!customerId)redirect("/min-side");
 if(live){
  const result=await customerSigningArchive(customerId);
  return <main style={{maxWidth:1100,margin:"auto",padding:16}}><Link href="/min-side">← Min side</Link><section className={styles.portal}><div className={styles.brand}><span>AADLAND SIGNERING</span><h1>Mine avtaler</h1><p>Private dokumenter og avtaleversjoner</p></div>
  {!result.ok?<p role="alert" className={styles.notice}>Avtalearkivet kunne ikke hentes fullstendig. Prøv igjen eller kontakt oss.</p>:result.rows.length===0?<p>Ingen avtaler registrert.</p>:<div className={styles.list}>{result.rows.map(r=><article key={r.id} className={styles.row}><div><h2>Ordre {r.orderNumber} · Versjon {r.revision}</h2><p>{r.current?"Gjeldende versjon":"Tidligere versjon"}</p><p>{r.signedAt?"Signert "+new Date(r.signedAt).toLocaleString("nb-NO",{timeZone:"Europe/Oslo"}):"Ingen registrert signatur"}</p></div><div className={styles.actions}><a className="btn alt" href={r.documentUrl}>Last ned avtale</a>{r.proofUrl&&<a className="btn alt" href={r.proofUrl}>Last ned signeringsbevis</a>}</div></article>)}</div>}
  <p>Signering er ikke en betalingsbekreftelse.</p></section></main>;
 }
 return <main style={{maxWidth:1100,margin:"auto",padding:16}}><Link href="/min-side">← Min side</Link><SigningPortalDemo/></main>;
}
