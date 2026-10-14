"use client";

export default function DrawingError({ error, reset }) {
  return (
    <main className="siteStatePage">
      <section className="siteStateCard">
        <img src="/aadland-service-logo.webp" alt="Aadland Service" className="siteStateLogo" />
        <div className="kicker">TEGNEPROGRAMMET</div>
        <h1>Vi fikk ikke åpnet tegneprogrammet</h1>
        <p>Feilen skjer inne i tegneprogrammet. Prøv én gang til. Hvis det fortsatt stopper, kan teksten under brukes til å finne den konkrete feilen.</p>
        {error?.message ? (
          <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", textAlign: "left", padding: 12, borderRadius: 8, background: "rgba(127,127,127,.12)", fontSize: 13 }}>
            {error.message}
          </pre>
        ) : null}
        {error?.digest ? <p style={{ fontSize: 12, opacity: 0.75 }}>Feilkode: {error.digest}</p> : null}
        <div className="siteStateActions">
          <button className="btn" type="button" onClick={() => reset()}>Prøv igjen</button>
          <a className="btn alt" href="/admin">Til Admin</a>
        </div>
      </section>
    </main>
  );
}
