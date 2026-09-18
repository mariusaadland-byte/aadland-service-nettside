"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function ProdukterPage() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadCategories() {
      try {
        const response = await fetch("/api/categories");

        const data = await response
          .json()
          .catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            data.error ||
              "Kategoriene kunne ikke hentes."
          );
        }

        setCategories(data.categories || []);
      } catch (error) {
        setError(
          error.message ||
            "Kategoriene kunne ikke hentes."
        );
      } finally {
        setLoading(false);
      }
    }

    loadCategories();
  }, []);

  return (
    <main>
      <section
        style={{
          maxWidth: 1180,
          margin: "0 auto",
          padding: "70px 24px 100px",
        }}
      >
        <div
          style={{
            marginBottom: 42,
          }}
        >
          <Link
            href="/"
            style={{
              textDecoration: "none",
              color: "inherit",
              opacity: 0.7,
            }}
          >
            ← Tilbake til forsiden
          </Link>

          <div
            className="kicker"
            style={{
              marginTop: 28,
            }}
          >
            Aadland Service
          </div>

          <h1
            style={{
              marginBottom: 14,
            }}
          >
            Produkter
          </h1>

          <p
            style={{
              maxWidth: 680,
              fontSize: 18,
              lineHeight: 1.6,
              opacity: 0.75,
            }}
          >
            Se våre produkter og løsninger som
            lages på bestilling. Velg en kategori
            for å se produktene.
          </p>
        </div>

        {loading && (
          <p>Laster kategorier...</p>
        )}

        {error && (
          <div className="card">
            <h3>Noe gikk galt</h3>
            <p>{error}</p>
          </div>
        )}

        {!loading &&
          !error &&
          categories.length === 0 && (
            <div className="card">
              <h3>Ingen kategorier ennå</h3>

              <p>
                Det ligger ingen aktive kategorier
                i nettbutikken akkurat nå.
              </p>
            </div>
          )}

        {!loading &&
          !error &&
          categories.length > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(280px, 1fr))",
                gap: 24,
              }}
            >
              {categories.map((category) => (
                <Link
                  key={category.id}
                  href={`/produkter/kategori/${category.slug}`}
                  style={{
                    color: "inherit",
                    textDecoration: "none",
                  }}
                >
                  <article
                    className="card"
                    style={{
                      height: "100%",
                      overflow: "hidden",
                      padding: 0,
                      cursor: "pointer",
                    }}
                  >
                    {category.imageUrl ? (
                      <img
                        src={category.imageUrl}
                        alt={category.name}
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
                          background:
                            "rgba(0,0,0,0.05)",
                          fontSize: 54,
                          fontWeight: 700,
                          opacity: 0.25,
                        }}
                      >
                        AS
                      </div>
                    )}

                    <div
                      style={{
                        padding: 24,
                      }}
                    >
                      <div className="kicker">
                        Produktkategori
                      </div>

                      <h2
                        style={{
                          marginTop: 8,
                          marginBottom: 10,
                        }}
                      >
                        {category.name}
                      </h2>

                      {category.description && (
                        <p
                          style={{
                            lineHeight: 1.6,
                            opacity: 0.75,
                          }}
                        >
                          {category.description}
                        </p>
                      )}

                      <div
                        style={{
                          marginTop: 20,
                          fontWeight: 700,
                        }}
                      >
                        Se produkter →
                      </div>
                    </div>
                  </article>
                </Link>
              ))}
            </div>
          )}
      </section>
    </main>
  );
}
