"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { nok } from "../../../../lib/catalog";
import { CatalogFooter, CatalogHeader, CatalogPlaceholder } from "../../ProductChrome";

export default function CategoryPage() {
  const params = useParams();
  const slug = params?.slug;
  const [category, setCategory] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!slug) return;
    async function load() {
      try {
        setLoading(true);
        setError("");
        const [categoriesResponse, productsResponse] = await Promise.all([
          fetch("/api/categories"),
          fetch("/api/products"),
        ]);
        const categoriesData = await categoriesResponse.json().catch(() => ({}));
        const productsData = await productsResponse.json().catch(() => ({}));
        if (!categoriesResponse.ok) throw new Error(categoriesData.error || "Kategorien kunne ikke hentes.");
        if (!productsResponse.ok) throw new Error(productsData.error || "Produktene kunne ikke hentes.");

        const found = (categoriesData.categories || []).find((item) => item.slug === slug);
        if (!found) {
          setCategory(null);
          setProducts([]);
          return;
        }
        setCategory(found);
        setProducts((productsData.products || []).filter((product) => product.categoryId === found.id));
      } catch (err) {
        setError(err.message || "Innholdet kunne ikke hentes.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [slug]);

  if (loading) {
    return (
      <main className="catalogPage">
        <CatalogHeader />
        <section className="catalogSection"><div className="catalogWrap"><div className="catalogStatus">Laster produkter …</div></div></section>
        <CatalogFooter />
      </main>
    );
  }

  if (error || !category) {
    return (
      <main className="catalogPage">
        <CatalogHeader />
        <section className="catalogSection">
          <div className="catalogWrap">
            <Link className="catalogBack" href="/produkter">← Tilbake til produkter</Link>
            <div className="catalogNotice catalogNoticeLarge">
              <b>{error ? "Noe gikk galt" : "Kategorien finnes ikke"}</b>
              <p>{error || "Kategorien kan ha blitt fjernet eller deaktivert."}</p>
            </div>
          </div>
        </section>
        <CatalogFooter />
      </main>
    );
  }

  return (
    <main className="catalogPage">
      <CatalogHeader />

      <section
        className={"catalogHero catalogHeroCategory " + (category.imageUrl ? "hasCatalogHeroImage" : "")}
        style={category.imageUrl ? { "--catalog-hero-image": `url("${category.imageUrl}")` } : undefined}
      >
        <div className="catalogWrap catalogHeroInner">
          <Link className="catalogBack" href="/produkter">← Alle kategorier</Link>
          <div className="catalogEyebrow">PRODUKTER</div>
          <h1>{category.name}</h1>
          <p>{category.description || "Se våre tilgjengelige produkter i denne kategorien."}</p>
        </div>
      </section>

      <section className="catalogSection">
        <div className="catalogWrap">
          <div className="catalogSectionHead compact">
            <div>
              <span className="catalogEyebrow">UTVALG</span>
              <h2>{products.length ? `${products.length} produkt${products.length === 1 ? "" : "er"}` : "Produkter"}</h2>
            </div>
          </div>

          {products.length === 0 ? (
            <div className="catalogNotice">
              <b>Ingen produkter i denne kategorien ennå</b>
              <p>Det er foreløpig ingen aktive produkter i kategorien.</p>
            </div>
          ) : (
            <div className="catalogGrid productGrid">
              {products.map((product) => {
                const image = (Array.isArray(product.imageUrls) && product.imageUrls[0]) || product.imageUrl;
                return (
                  <Link key={product.id} href={`/produkter/${product.slug}`} className="catalogCard productCard">
                    <div className="catalogMedia">
                      {image ? <img src={image} alt={product.name} /> : <CatalogPlaceholder label="Produktbilde kommer" />}
                    </div>
                    <div className="catalogCardBody">
                      <div className="catalogCardMeta">
                        <span className="catalogEyebrow">{category.name.toUpperCase()}</span>
                        <span className={"catalogStockBadge " + (product.inventoryMode === "stock" && Number(product.stockQuantity) <= 0 ? "isSoldOut" : "")}>
                          {product.inventoryMode === "stock"
                            ? (Number(product.stockQuantity) > 0 ? `${product.stockQuantity} på lager` : "Utsolgt")
                            : "På bestilling"}
                        </span>
                      </div>
                      <h3>{product.name}</h3>
                      {product.description && <p>{product.description}</p>}
                      <div className="catalogPrice">Fra {nok(product.basePriceOre || 0)}</div>
                      {product.inventoryMode !== "stock" && product.leadTimeText && (
                        <div className="catalogLeadTime">{product.leadTimeText}</div>
                      )}
                      <span className="catalogCardLink">Se produkt <b>→</b></span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <CatalogFooter />
    </main>
  );
}
