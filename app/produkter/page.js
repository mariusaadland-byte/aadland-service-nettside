"use client";

import { useEffect, useMemo, useState } from "react";
import { fallbackProducts, nok } from "../../lib/catalog";

export default function ProductsPage() {
  const [products, setProducts] =
    useState(fallbackProducts);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    fetch("/api/products")
      .then((response) =>
        response.ok
          ? response.json()
          : null
      )
      .then((data) => {
        if (
          Array.isArray(
            data?.products
          )
        ) {
          setProducts(
            data.products
          );
        }
      })
      .catch(() => {})
      .finally(() =>
        setLoading(false)
      );
  }, []);

  const activeProducts =
    useMemo(
      () =>
        products.filter(
          (product) =>
            product.active !==
            false
        ),
      [products]
    );

  const categories =
    useMemo(() => {
      const grouped = {};

      activeProducts.forEach(
        (product) => {
          const category =
            product.category?.trim() ||
            "Andre produkter";

          if (!grouped[category]) {
            grouped[category] =
              [];
          }

          grouped[category].push(
            product
          );
        }
      );

      return Object.entries(
        grouped
      );
    }, [activeProducts]);

  return (
    <main>
      <header className="top">
        <div className="wrap nav">
          <a
            className="brand"
            href="/"
          >
            <span className="mark">
              AS
            </span>

            <span>
              Aadland
              <br />
              Service
            </span>
          </a>

          <nav className="links">
            <a href="/">
              Forside
            </a>

            <a href="/produkter">
              Produkter
            </a>

            <a href="/#om">
              Om oss
            </a>

            <a href="/#kontakt">
              Kontakt
            </a>
          </nav>
        </div>
      </header>

      <section
        className="section"
        style={{
          paddingTop: 70,
        }}
      >
        <div className="wrap">
          <div className="kicker">
            Aadland Service
          </div>

          <h1
            style={{
              marginBottom: 18,
            }}
          >
            Produkter
          </h1>

          <p
            className="muted"
            style={{
              maxWidth: 700,
              fontSize: 18,
              lineHeight: 1.7,
            }}
          >
            Se produktene våre
            etter kategori. Trykk
            på et produkt for å se
            bilder, mål,
            spesifikasjoner og
            tilgjengelige
            varianter.
          </p>
        </div>
      </section>

      {loading ? (
        <section className="section">
          <div className="wrap">
            <p className="muted">
              Henter produkter...
            </p>
          </div>
        </section>
      ) : categories.length ===
        0 ? (
        <section className="section">
          <div className="wrap">
            <div className="card">
              <h3>
                Ingen produkter
                ennå
              </h3>

              <p className="muted">
                Produktene kommer
                snart.
              </p>
            </div>
          </div>
        </section>
      ) : (
        categories.map(
          ([
            category,
            categoryProducts,
          ]) => (
            <section
              className="section"
              key={category}
            >
              <div className="wrap">
                <div className="kicker">
                  Kategori
                </div>

                <h2>
                  {category}
                </h2>

                <div
                  className="grid"
                  style={{
                    marginTop: 28,
                  }}
                >
                  {categoryProducts.map(
                    (product) => (
                      <ProductCard
                        key={
                          product.id
                        }
                        product={
                          product
                        }
                      />
                    )
                  )}
                </div>
              </div>
            </section>
          )
        )
      )}

      <section
        className="section"
        style={{
          background:
            "#eee8dd",
        }}
      >
        <div className="wrap">
          <div className="kicker">
            Etter mål
          </div>

          <h2>
            Finner du ikke det du
            trenger?
          </h2>

          <p
            className="muted"
            style={{
              maxWidth: 650,
            }}
          >
            Vi lager også
            løsninger på
            bestilling etter dine
            mål og ønsker.
          </p>

          <a
            className="btn"
            href="/#custom"
            style={{
              display:
                "inline-block",
              marginTop: 18,
            }}
          >
            Send forespørsel
          </a>
        </div>
      </section>

      <footer
        id="kontakt"
        className="footer"
      >
        <div className="wrap row">
          <div>
            <b>
              Aadland Service
            </b>

            <p>
              Bygg • Renovering •
              Vedlikehold •
              Hagearbeid
            </p>
          </div>

          <div>
            <p>
              post@aadland-service.no
            </p>

            <p>
              471 54 898
            </p>

            <p>
              Org.nr. 937 781 873
              MVA
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}

function ProductCard({
  product,
}) {
  const image =
    (Array.isArray(
      product.imageUrls
    ) &&
      product.imageUrls[0]) ||
    product.imageUrl;

  return (
    <a
      href={`/produkter/${encodeURIComponent(
        product.slug ||
          product.id
      )}`}
      className="card"
      style={{
        display: "block",
        textDecoration: "none",
        color: "inherit",
        overflow: "hidden",
      }}
    >
      {image && (
        <img
          src={image}
          alt={product.name}
          style={{
            width: "100%",
            height: 280,
            objectFit: "cover",
            borderRadius: 14,
            marginBottom: 18,
            display: "block",
          }}
        />
      )}

      <div className="kicker">
        {product.category ||
          "På bestilling"}
      </div>

      <h3>
        {product.name}
      </h3>

      {product.description && (
        <p className="muted">
          {shortDescription(
            product.description
          )}
        </p>
      )}

      <div
        className="row"
        style={{
          marginTop: 20,
          alignItems: "center",
        }}
      >
        <div>
          <small className="muted">
            Fra
          </small>

          <div
            className="price"
            style={{
              marginTop: 2,
            }}
          >
            {nok(
              product.basePriceOre ||
                0
            )}
          </div>
        </div>

        <span className="btn">
          Se produkt
        </span>
      </div>
    </a>
  );
}

function shortDescription(
  text
) {
  const value =
    String(text || "").trim();

  if (value.length <= 140) {
    return value;
  }

  return `${value.slice(
    0,
    137
  )}...`;
}
