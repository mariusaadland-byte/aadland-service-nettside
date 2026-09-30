"use client";

import { useState } from "react";
import Link from "next/link";

export function CatalogHeader({ rental = false }) {
  const [open, setOpen] = useState(false);

  return (
    <header className="catalogHeader">
      <div className="catalogWrap catalogNav">
        <Link href={rental?"/utleie":"/"} className={"catalogBrand "+(rental?"catalogRentalBrand":"")} aria-label={rental?"Aadland Utleie":"Aadland Service forsiden"}>
          <img src="/aadland-service-logo.webp" alt="Aadland Service" />
          {rental&&<span>UTLEIE</span>}
        </Link>

        <button
          className="catalogMenuButton"
          type="button"
          aria-label={open ? "Lukk meny" : "Åpne meny"}
          aria-expanded={open}
          aria-controls="catalog-menu"
          onClick={() => setOpen((value) => !value)}
        >
          <span />
          <span />
          <span />
        </button>

        <nav id="catalog-menu" className={"catalogLinks " + (open ? "isOpen" : "")}>
          {rental?<>
            <Link href="/utleie" onClick={() => setOpen(false)}>Utleie</Link>
            <Link href="/min-side" onClick={() => setOpen(false)}>Min side</Link>
            <Link href="/vilkar/utleie" onClick={() => setOpen(false)}>Utleiebetingelser</Link>
            <a href="https://www.aadland-service.no" onClick={() => setOpen(false)}>Aadland Service</a>
            <a href="mailto:post@aadland-service.no" onClick={() => setOpen(false)}>Kontakt</a>
          </>:<>
            <Link href="/" onClick={() => setOpen(false)}>Hjem</Link>
            <Link href="/min-side" onClick={() => setOpen(false)}>Min side</Link>
            <Link href="/#tjenester" onClick={() => setOpen(false)}>Tjenester</Link>
            <Link href="/produkter" onClick={() => setOpen(false)}>Produkter</Link>
            <Link href="/utleie" onClick={() => setOpen(false)}>Utleie</Link>
            <Link href="/prosjekter" onClick={() => setOpen(false)}>Tidligere oppdrag</Link>
            <Link href="/#om" onClick={() => setOpen(false)}>Om oss</Link>
            <Link href="/#kontakt" onClick={() => setOpen(false)}>Kontakt</Link>
          </>}
        </nav>

        <Link href={rental?"/utleie#utleiekatalog":"/#befaring"} className="catalogHeaderCta">
          {rental?"Se utstyr →":"Gratis befaring →"}
        </Link>
      </div>
    </header>
  );
}

export function CatalogFooter({ rental = false }) {
  return (
    <footer className="catalogFooter">
      <div className="catalogWrap catalogFooterGrid">
        <div>
          <img className="catalogFooterLogo" src="/aadland-service-logo.webp" alt="Aadland Service" />
          {rental?<><strong className="catalogFooterRentalLabel">AADLAND UTLEIE</strong><p className="catalogFooterTagline">Utstyr når du trenger det</p></>:<p className="catalogFooterTagline">Lokalt håndverk – solide resultater</p>}
        </div>
        <div>
          <b>Kontakt</b>
          <a href="tel:47154898">471 54 898</a>
          <a href="mailto:post@aadland-service.no">post@aadland-service.no</a>
        </div>
        <div>
          <b>Snarveier</b>
          {rental?<>
            <Link href="/utleie">Utleie</Link>
            <Link href="/min-side">Min side</Link>
            <Link href="/vilkar/utleie">Utleiebetingelser</Link>
            <Link href="/personvern">Personvern</Link>
            <a href="https://www.aadland-service.no">Aadland Service</a>
          </>:<>
            <Link href="/">Forside</Link>
            <Link href="/min-side">Min side</Link>
            <Link href="/#tjenester">Tjenester</Link>
            <Link href="/produkter">Produkter</Link>
            <Link href="/utleie">Utleie</Link>
            <Link href="/prosjekter">Tidligere oppdrag</Link>
            <Link href="/vilkar/salg">Salgsbetingelser</Link>
            <Link href="/vilkar/utleie">Utleiebetingelser</Link>
            <Link href="/personvern">Personvern</Link>
          </>}
        </div>
      </div>
      <div className="catalogWrap catalogFooterBottom">
        <span>{rental?"© Aadland Utleie · Aadland Service":"© Aadland Service"}</span>
        <span>Org.nr. 937 781 873 MVA</span>
      </div>
    </footer>
  );
}

export function CatalogPlaceholder({ label = "Bilde kommer" }) {
  return (
    <div className="catalogPlaceholder" aria-label={label}>
      <img src="/aadland-service-logo.webp" alt="" />
      <span>{label}</span>
    </div>
  );
}
