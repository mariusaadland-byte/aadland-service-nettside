export default function Loading(){
  return <main className="siteStatePage siteStateLoading" aria-live="polite">
    <section className="siteStateCard">
      <img src="/aadland-service-logo.webp" alt="Aadland Service" className="siteStateLogo"/>
      <div className="siteStateSpinner" aria-hidden="true"/>
      <p>Laster inn …</p>
    </section>
  </main>;
}
