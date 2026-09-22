"use client";

import { useState } from "react";
import Link from "next/link";

export function CatalogHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="catalogHeader">
      <div className="catalogWrap catalogNav">
        <Link href="/" className="catalogBrand" aria-label="Aadland Service forsiden">
          <img src="/aadland-service-logo.webp" alt="Aadland Service" />
        </Link>

        <button
          className="catalogMenuButton"
          type="button"
          aria-label={open ? "Lukk meny" : "Åpne meny"}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <span />
          <span />
          <span />
        </button>

        <nav className={"catalogLinks " + (open ? "isOpen" : "")}>
          <Link href="/" onClick={() => setOpen(false)}>Hjem</Link>
          <Link href="/produkter" onClick={() => setOpen(false)}>Produkter</Link>
          <Link href="/utleie" onClick={() => setOpen(false)}>Utleie</Link>
          <Link href="/#tjenester" onClick={() => setOpen(false)}>Tjenester</Link>
          <Link href="/#prosjekter" onClick={() => setOpen(false)}>Tidligere oppdrag</Link>
          <Link href="/#kontakt" onClick={() => setOpen(false)}>Kontakt</Link>
        </nav>

        <Link href="/#befaring" className="catalogHeaderCta">
          Gratis befaring →
        </Link>
      </div>
    </header>
  );
}

export function CatalogFooter() {
  return (
    <footer className="catalogFooter">
      <div className="catalogWrap catalogFooterGrid">
        <div>
          <img className="catalogFooterLogo" src="/aadland-service-logo.webp" alt="Aadland Service" />
          <p className="catalogFooterTagline">Lokalt håndverk – solide resultater</p>
        </div>
        <div>
          <b>Kontakt</b>
          <a href="tel:47154898">471 54 898</a>
          <a href="mailto:post@aadland-service.no">post@aadland-service.no</a>
        </div>
        <div>
          <b>Snarveier</b>
          <Link href="/">Forside</Link>
          <Link href="/produkter">Produkter</Link>
          <Link href="/utleie">Utleie</Link>
          <Link href="/vilkar/salg">Salgsbetingelser</Link>
          <Link href="/vilkar/utleie">Utleiebetingelser</Link>
          <Link href="/personvern">Personvern</Link>
        </div>
      </div>
      <div className="catalogWrap catalogFooterBottom">
        <span>© Aadland Service</span>
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
