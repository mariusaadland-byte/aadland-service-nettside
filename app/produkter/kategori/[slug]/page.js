"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { nok } from "../../../../lib/catalog";

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

        if (!categoriesResponse.ok) {
          throw new Error(
            categoriesData.error || "Kategorien kunne ikke hentes."
          );
        }

        if (!productsResponse.ok) {
          throw new Error(
            productsData.error || "Produktene kunne ikke hentes."
          );
        }

        const foundCategory = (categoriesData.categories || []).find(
          (item) => item.slug === slug
        );

        if (!foundCategory) {
          setCategory(null);
          setProducts([]);
          return;
        }

        setCategory(foundCategory);

        setProducts(
          (productsData.products || []).filter(
            (product) => product.categoryId === foundCategory.id
          )
        );
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
      <main>
        <section
          style={{
            maxWidth: 1180,
            margin: "0 auto",
            padding: "70px 24px 100px",
          }}
        >
          <p>Laster produkter...</p>
        </section>
      </main>
    );
  }

  if (error || !category) {
    return (
      <main>
        <section
          style={{
            maxWidth: 1180,
            margin: "0 auto",
            padding: "70px 24px 100px",
          }}
        >
          <Link
            href="/produkter"
            style={{ color: "inherit", textDecoration: "none" }}
          >
            ← Tilbake til produkter
          </Link>

          <div className="card" style={{ marginTop: 30 }}>
            <h2>{error ? "Noe gikk galt" : "Kategorien finnes ikke"}</h2>
            <p>
              {error || "Kategorien kan ha blitt fjernet eller deaktivert."}
            </p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main>
      <section
        style={{
          maxWidth: 1180,
          margin: "0 auto",
          padding: "70px 24px 100px",
        }}
      >
        <Link
          href="/produkter"
          style={{
            color: "inherit",
            textDecoration: "none",
            opacity: 0.7,
          }}
        >
          ← Alle kategorier
        </Link>

        <div style={{ marginTop: 30, marginBottom: 42 }}>
          <div className="kicker">Produkter</div>

          <h1 style={{ marginBottom: 12 }}>{category.name}</h1>

          {category.description && (
            <p
              style={{
                maxWidth: 700,
                fontSize: 18,
                lineHeight: 1.6,
                opacity: 0.75,
              }}
            >
              {category.description}
            </p>
          )}
        </div>

        {products.length === 0 ? (
          <div className="card">
            <h3>Ingen produkter i denne kategorien ennå</h3>
            <p>Det er foreløpig ingen aktive produkter i kategorien.</p>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 24,
            }}
          >
            {products.map((product) => {
              const image =
                (Array.isArray(product.imageUrls) &&
                  product.imageUrls[0]) ||
                product.imageUrl;

              return (
                <Link
                  key={product.id}
                  href={`/produkter/${product.slug}`}
                  style={{
                    color: "inherit",
                    textDecoration: "none",
                  }}
                >
                  <article
                    className="card"
                    style={{
                      height: "100%",
                      padding: 0,
                      overflow: "hidden",
                      cursor: "pointer",
                    }}
                  >
                    {image ? (
                      <img
                        src={image}
                        alt={product.name}
                        style={{
                          display: "block",
                          width: "100%",
                          height: 260,
                          objectFit: "cover",
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          height: 260,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: "rgba(0,0,0,0.05)",
                          fontSize: 54,
                          fontWeight: 700,
                          opacity: 0.25,
                        }}
                      >
                        AS
                      </div>
                    )}

                    <div style={{ padding: 24 }}>
                      <div className="kicker">
                        {category.name}
                      </div>

                      <h2
                        style={{
                          marginTop: 8,
                          marginBottom: 10,
                        }}
                      >
                        {product.name}
                      </h2>

                      {product.description && (
                        <p
                          style={{
                            lineHeight: 1.6,
                            opacity: 0.75,
                          }}
                        >
                          {product.description}
                        </p>
                      )}

                      <div
                        style={{
                          marginTop: 18,
                          fontSize: 19,
                          fontWeight: 700,
                        }}
                      >
                        Fra {nok(product.basePriceOre || 0)}
                      </div>

                      <div
                        style={{
                          marginTop: 16,
                          fontWeight: 700,
                        }}
                      >
                        Se produkt →
                      </div>
                    </div>
                  </article>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
