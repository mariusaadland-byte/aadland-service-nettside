"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CatalogFooter, CatalogHeader, CatalogPlaceholder } from "./ProductChrome";

export default function ProdukterPage() {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadCategories() {
      try {
        const [categoriesResponse, productsResponse] = await Promise.all([
          fetch("/api/categories"),
          fetch("/api/products"),
        ]);
        const categoriesData = await categoriesResponse.json().catch(() => ({}));
        const productsData = await productsResponse.json().catch(() => ({}));
        if (!categoriesResponse.ok) throw new Error(categoriesData.error || "Kategoriene kunne ikke hentes.");
        if (!productsResponse.ok) throw new Error(productsData.error || "Produktene kunne ikke hentes.");
        setCategories(categoriesData.categories || []);
        setProducts(productsData.products || []);
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
              {categories.map((category) => {
                const productCount = products.filter((product) => product.categoryId === category.id).length;
                return (
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
                    <div className="catalogCardMeta">
                      <span className="catalogEyebrow">PRODUKTKATEGORI</span>
                      <span className="catalogCountBadge">{productCount} {productCount === 1 ? "produkt" : "produkter"}</span>
                    </div>
                    <h3>{category.name}</h3>
                    {category.description && <p>{category.description}</p>}
                    <span className="catalogCardLink">Se produkter <b>→</b></span>
                  </div>
                </Link>
                );
              })}
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
