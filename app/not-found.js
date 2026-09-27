import Link from "next/link";

export const metadata={
  title:"Siden ble ikke funnet",
  robots:{index:false,follow:false}
};

export default function NotFound(){
  return <main className="siteStatePage">
    <section className="siteStateCard">
      <img src="/aadland-service-logo.webp" alt="Aadland Service" className="siteStateLogo"/>
      <div className="kicker">404</div>
      <h1>Siden ble ikke funnet</h1>
      <p>Lenken kan være gammel, eller siden kan ha blitt flyttet.</p>
      <div className="siteStateActions">
        <Link className="btn" href="/">Til forsiden</Link>
        <Link className="btn alt" href="/produkter">Se produkter</Link>
      </div>
    </section>
  </main>;
}
