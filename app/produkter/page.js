"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CatalogFooter, CatalogHeader, CatalogPlaceholder } from "./ProductChrome";

export default function ProdukterPage() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadCategories() {
      try {
        const response = await fetch("/api/categories");
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Kategoriene kunne ikke hentes.");
        setCategories(data.categories || []);
      } catch (err) {
        setError(err.message || "Kategoriene kunne ikke hentes.");
      } finally {
        setLoading(false);
      }
    }
    loadCategories();
  }, []);

  return (
    <main className="catalogPage">
      <CatalogHeader />

      <section className="catalogHero catalogHeroProducts">
        <div className="catalogWrap catalogHeroInner">
          <Link className="catalogBack" href="/">← Tilbake til forsiden</Link>
          <div className="catalogEyebrow">AADLAND SERVICE · PÅ BESTILLING</div>
          <h1>Produkter</h1>
          <p>
            Solide produkter og spesialtilpassede løsninger med samme uttrykk,
            kvalitet og oppfølging som resten av Aadland Service.
          </p>
        </div>
      </section>

      <section className="catalogSection">
        <div className="catalogWrap">
          <div className="catalogSectionHead">
            <div>
              <span className="catalogEyebrow">VELG KATEGORI</span>
              <h2>Finn løsningen som passer</h2>
            </div>
            <p>Alle produkter kan tilpasses etter mål og behov der det er oppgitt.</p>
          </div>

          {loading && <div className="catalogStatus">Laster kategorier …</div>}

          {error && (
            <div className="catalogNotice">
              <b>Noe gikk galt</b>
              <p>{error}</p>
            </div>
          )}

          {!loading && !error && categories.length === 0 && (
            <div className="catalogNotice">
              <b>Ingen kategorier ennå</b>
              <p>Det ligger ingen aktive kategorier i nettbutikken akkurat nå.</p>
            </div>
          )}

          {!loading && !error && categories.length > 0 && (
            <div className="catalogGrid categoryGrid">
              {categories.map((category) => (
                <Link
                  key={category.id}
                  href={`/produkter/kategori/${category.slug}`}
                  className="catalogCard categoryCard"
                >
                  <div className="catalogMedia">
                    {category.imageUrl ? (
                      <img src={category.imageUrl} alt={category.name} />
                    ) : (
                      <CatalogPlaceholder label="Kategoribilde kommer" />
                    )}
                  </div>
                  <div className="catalogCardBody">
                    <span className="catalogEyebrow">PRODUKTKATEGORI</span>
                    <h3>{category.name}</h3>
                    {category.description && <p>{category.description}</p>}
                    <span className="catalogCardLink">Se produkter <b>→</b></span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="catalogCallout">
        <div className="catalogWrap catalogCalloutInner">
          <div>
            <span className="catalogEyebrow">TILPASSET DEG</span>
            <h2>Har du en idé vi ikke har lagt ut?</h2>
            <p>Vi kan bygge etter andre mål og ønsker. Fortell oss hva du trenger.</p>
          </div>
          <Link href="/#befaring" className="catalogGoldButton">Send forespørsel →</Link>
        </div>
      </section>

      <CatalogFooter />
    </main>
  );
}
