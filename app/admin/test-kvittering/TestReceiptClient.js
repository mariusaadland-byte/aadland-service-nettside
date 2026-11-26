"use client";

import Link from "next/link";

export default function TestReceiptClient(){
 return <main className="admin">
  <section className="adminmain" style={{marginLeft:0,maxWidth:800}}>
   <Link href="/admin">← Tilbake til backoffice</Link>
   <div className="kicker" style={{marginTop:28}}>PREVIEW / TEST</div>
   <h1>Test av kvittering</h1>
   <div className="card">
    <p><b>Testmiljøet sender ikke e-post.</b></p>
    <p className="muted">Åpne en tydelig merket test-PDF med fiktive varer, variantvalg, frakt, kundenotat og MVA. Ingen ekte kundeopplysninger, bestillinger eller betalinger blir registrert. Eksempelsummen er 10 550 kr.</p>
    <a className="btn" href="/api/admin/test-receipt" target="_blank" rel="noopener noreferrer">Åpne testkvittering (PDF)</a>
   </div>
  </section>
 </main>;
}
