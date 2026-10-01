import {COMPANY_ADDRESS,COMPANY_INFO} from "../../../lib/companyInfo";

export const metadata={
 title:"Salgsbetingelser",
 description:"Salgsbetingelser for kjøp av varer fra Aadland Service.",
 alternates:{canonical:"/vilkar/salg"}
};

export default function SalesTerms(){
 return <main className="legalPage"><div className="legalWrap">
  <a href="/produkter">← Tilbake til produkter</a>
  <div className="kicker">AADLAND SERVICE</div>
  <h1>Salgsbetingelser</h1>
  <p className="legalLead">Disse betingelsene gjelder kjøp av varer fra Aadland Service på nett og bygger på reglene for forbrukerkjøp og fjernsalg.</p>

  <h2>1. Partene</h2>
  <p><b>Selger:</b> {COMPANY_INFO.name}, org.nr. {COMPANY_INFO.orgNumber}.<br/>
  <b>Adresse:</b> {COMPANY_ADDRESS}.<br/>
  <b>Telefon:</b> {COMPANY_INFO.phone}.<br/>
  <b>E-post:</b> {COMPANY_INFO.email}.</p>

  <h2>2. Avtalen</h2>
  <p>Avtalen består av opplysningene i bestillingsløsningen, disse betingelsene og eventuell særskilt avtale mellom kunden og Aadland Service.</p>

  <h2>3. Pris</h2>
  <p>Oppgitt pris inkluderer merverdiavgift. Frakt eller levering som kommer i tillegg skal vises før kunden fullfører bestillingen.</p>

  <h2>4. Betaling</h2>
  <p>Betalingsmåte og tidspunkt for betaling opplyses i bestillingsløsningen. Dersom Vipps eller annen elektronisk betaling tilbys, skal kunden aktivt godta gjeldende vilkår før betalingen initieres. Ved betalingsreservasjon belastes ikke beløpet endelig før varen eller tjenesten er klar til levering, i samsvar med gjeldende regler for betalingsløsningen.</p>

  <h2>5. Levering</h2>
  <p>Lagervarer leveres eller sendes etter oppgitt leveringstid. Varer som produseres på bestilling får oppgitt forventet produksjons- eller leveringstid. Kunden får beskjed dersom tidspunktet endres vesentlig.</p>

  <h2>6. Frakt og henting</h2>
  <p>Varer som kan sendes får fraktkostnad oppgitt før bestilling. Store produkter kan være begrenset til henting eller lokal levering.</p>

  <h2>7. Angrerett</h2>
  <p>For standardvarer gjelder angrerett etter angrerettloven når vilkårene for dette er oppfylt. Angrefristen er normalt 14 dager etter at varen og lovpålagt informasjon er mottatt. Angreretten kan være unntatt for varer som faktisk fremstilles etter kundens spesifikasjoner eller får et tydelig personlig preg. Kunden skal få tydelig informasjon dersom et slikt unntak gjelder.</p>
  <p>Standard angreskjema finnes hos <a href="https://www.regjeringen.no/no/dokument/dep/bld/skjema/skjema-2/skjema-om-angrerett/id614564/" target="_blank" rel="noreferrer">Barne- og familiedepartementet</a>.</p>

  <h2>8. Retur ved bruk av angrerett</h2>
  <p>Kunden skal returnere varen uten unødig opphold og senest innen 14 dager etter at melding om bruk av angreretten er gitt, når angreretten gjelder. Kunden bærer normalt direkte returkostnader dersom dette er opplyst på forhånd. Varen skal håndteres på en måte som gjør det mulig å vurdere art, egenskaper og funksjon.</p>

  <h2>9. Forsinkelse og mangler</h2>
  <p>Ved forsinkelse eller mangel gjelder kundens rettigheter etter ufravikelig forbrukerlovgivning. Kontakt Aadland Service så raskt som mulig dersom noe er feil med varen eller leveringen.</p>

  <h2>10. Reklamasjon</h2>
  <p>Reklamasjon sendes til {COMPANY_INFO.email} med ordrenummer og en beskrivelse av problemet. Reklamasjon behandles etter gjeldende forbrukerkjøpsregler.</p>

  <h2>11. Konfliktløsning</h2>
  <p>Ved uenighet ber vi kunden først kontakte Aadland Service. Dersom partene ikke kommer til enighet, kan en forbruker be Forbrukertilsynet om mekling. Saker som fyller vilkårene kan deretter behandles av Forbrukerklageutvalget.</p>

  <h2>12. Kontakt</h2>
  <p>{COMPANY_INFO.name} · org.nr. {COMPANY_INFO.orgNumber}<br/>{COMPANY_ADDRESS}<br/>{COMPANY_INFO.email} · {COMPANY_INFO.phone}</p>

  <p className="muted">Versjon 2026-10. Ordren skal lagre hvilken versjon kunden godtok.</p>
 </div></main>
}
