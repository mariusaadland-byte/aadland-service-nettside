"use client";

export default function ErrorPage({reset}){
  return <main className="siteStatePage">
    <section className="siteStateCard">
      <img src="/aadland-service-logo.webp" alt="Aadland Service" className="siteStateLogo"/>
      <div className="kicker">NOE GIKK GALT</div>
      <h1>Vi fikk ikke lastet siden</h1>
      <p>Prøv igjen. Hvis problemet fortsetter, kan du gå tilbake til forsiden.</p>
      <div className="siteStateActions">
        <button className="btn" type="button" onClick={()=>reset()}>Prøv igjen</button>
        <a className="btn alt" href="/">Til forsiden</a>
      </div>
    </section>
  </main>;
}
