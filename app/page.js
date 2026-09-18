"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  fallbackProducts,
  nok,
  productPrice,
} from "../lib/catalog";

const emptyCustomer = {
  name: "",
  email: "",
  phone: "",
  address: "",
  postalCode: "",
  city: "",
  note: "",
  deliveryWithinRadius: true,
};

export default function Home() {
  const [products, setProducts] =
    useState(fallbackProducts);

  const [cart, setCart] = useState([]);
  const [open, setOpen] = useState(false);

  const [customer, setCustomer] =
    useState(emptyCustomer);

  const [fulfillment, setFulfillment] =
    useState("pickup");

  const [message, setMessage] =
    useState(null);

  const [error, setError] =
    useState("");

  const [custom, setCustom] =
    useState("");

  useEffect(() => {
    fetch("/api/products")
      .then((r) =>
        r.ok ? r.json() : null
      )
      .then((d) => {
        if (d?.products?.length) {
          setProducts(d.products);
        }
      })
      .catch(() => {});
  }, []);

  const total = cart.reduce(
    (sum, item) =>
      sum +
      item.unitPriceOre *
        item.quantity,
    0
  );

  function add(product, selected) {
    const price = productPrice(
      product,
      selected
    );

    const key =
      product.id +
      JSON.stringify(selected);

    setCart((current) => {
      const found = current.find(
        (item) => item.key === key
      );

      if (found) {
        return current.map((item) =>
          item.key === key
            ? {
                ...item,
                quantity:
                  item.quantity + 1,
              }
            : item
        );
      }

      return [
        ...current,
        {
          key,
          productId: product.id,
          name: product.name,
          selectedOptions: selected,
          unitPriceOre: price,
          quantity: 1,
        },
      ];
    });

    setOpen(true);
  }

  async function order(e) {
    e.preventDefault();
    setError("");

    const response = await fetch(
      "/api/orders",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          orderType: "order",
          customer,
          fulfillmentType:
            fulfillment,
          deliveryWithinRadius:
            customer.deliveryWithinRadius,
          items: cart.map(
            ({
              productId,
              quantity,
              selectedOptions,
            }) => ({
              productId,
              quantity,
              selectedOptions,
            })
          ),
        }),
      }
    );

    const data =
      await response.json();

    if (!response.ok) {
      setError(
        data.error ||
          "Noe gikk galt."
      );
      return;
    }

    setMessage(data);
    setCart([]);
  }

  async function customOrder(e) {
    e.preventDefault();
    setError("");

    const response = await fetch(
      "/api/orders",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          orderType: "custom",
          customRequest: custom,
          customer,
          fulfillmentType:
            fulfillment,
          deliveryWithinRadius:
            customer.deliveryWithinRadius,
        }),
      }
    );

    const data =
      await response.json();

    if (!response.ok) {
      setError(
        data.error ||
          "Noe gikk galt."
      );
      return;
    }

    setMessage(data);
    setCustom("");
  }

  return (
    <main>
      <header className="top">
        <div className="wrap nav">
          <a
            className="brand"
            href="#"
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
            <a href="#produkter">
              Produkter
            </a>

            <a href="#slik">
              Slik fungerer det
            </a>

            <a href="#om">
              Om oss
            </a>

            <a href="#kontakt">
              Kontakt
            </a>

            <button
              className="btn"
              onClick={() =>
                setOpen(true)
              }
            >
              Handlekurv (
              {cart.reduce(
                (sum, item) =>
                  sum +
                  item.quantity,
                0
              )}
              )
            </button>
          </nav>
        </div>
      </header>

      <section className="wrap hero">
        <div>
          <div className="kicker">
            Bygget i Bergen · laget
            for deg
          </div>

          <h1>
            Kun
            <br />
            muligheter.
          </h1>

          <p>
            Bygg, renovering,
            vedlikehold og produkter
            på bestilling. Vi lager
            solide løsninger som
            tilpasses plassen og
            behovet ditt.
          </p>

          <div
            style={{
              display: "flex",
              gap: 12,
              marginTop: 28,
            }}
          >
            <a
              className="btn"
              href="#produkter"
            >
              Se produkter
            </a>

            <a
              className="btn alt"
              href="#custom"
            >
              Få noe laget
            </a>
          </div>
        </div>

        <div className="heroCard">
          <span className="kicker">
            Aadland Service
          </span>

          <strong>
            Laget på bestilling.
          </strong>

          <p>
            Henting eller levering
            innen 15 km.
          </p>
        </div>
      </section>

      <section
        id="produkter"
        className="section"
      >
        <div className="wrap">
          <div className="kicker">
            Produkter
          </div>

          <h2>
            Velg, tilpass og bestill.
          </h2>

          <p className="muted">
            Alle priser vises inkl.
            mva.
          </p>

          <div className="grid">
            {products
              .filter(
                (product) =>
                  product.active !==
                  false
              )
              .map((product) => (
                <Product
                  key={product.id}
                  p={product}
                  add={add}
                />
              ))}
          </div>
        </div>
      </section>

      <section
        id="slik"
        className="section"
        style={{
          background: "#eee8dd",
        }}
      >
        <div className="wrap">
          <div className="kicker">
            Slik fungerer det
          </div>

          <h2>
            Fra idé til ferdig
            produkt.
          </h2>

          <div className="grid">
            {[
              "Velg eller beskriv",
              "Vi bekrefter bestillingen",
              "Hent eller få levert",
            ].map((text, i) => (
              <div
                className="card"
                key={text}
              >
                <b>0{i + 1}</b>

                <h3>{text}</h3>

                <p className="muted">
                  {i === 0
                    ? "Velg et produkt og tilpass størrelse og overflate, eller send en egen forespørsel."
                    : i === 1
                    ? "Vi går gjennom bestillingen og tar kontakt dersom noe må avklares."
                    : "Store produkter hentes etter avtale eller leveres innenfor avtalt område."}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        id="custom"
        className="section"
      >
        <div className="wrap">
          <div className="kicker">
            På bestilling
          </div>

          <h2>
            Har du noe annet i
            tankene?
          </h2>

          <form
            className="card"
            onSubmit={customOrder}
            style={{
              maxWidth: 720,
            }}
          >
            <div className="field">
              <label>
                Beskriv hva du ønsker
              </label>

              <textarea
                rows="6"
                required
                value={custom}
                onChange={(e) =>
                  setCustom(
                    e.target.value
                  )
                }
                placeholder="Mål, materiale, bruk og andre ønsker …"
              />
            </div>

            <CustomerFields
              customer={customer}
              setCustomer={
                setCustomer
              }
            />

            <button className="btn">
              Send forespørsel
            </button>
          </form>
        </div>
      </section>

      <section
        id="om"
        className="section"
        style={{
          background: "#181613",
          color: "white",
        }}
      >
        <div className="wrap">
          <div className="kicker">
            Om Aadland Service
          </div>

          <h2>
            Praktiske løsninger.
            Solid utført.
          </h2>

          <p
            style={{
              maxWidth: 720,
              lineHeight: 1.7,
              opacity: 0.8,
            }}
          >
            Bygg, renovering,
            vedlikehold og produkter
            på bestilling i Bergen og
            omegn.
          </p>
        </div>
      </section>

      <footer
        id="kontakt"
        className="footer"
      >
        <div className="wrap row">
          <div>
            <b>Aadland Service</b>

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
            <p>471 54 898</p>
            <p>
              Org.nr. 937 781 873 MVA
            </p>
          </div>
        </div>
      </footer>

      {cart.length > 0 && (
        <button
          className="cart"
          onClick={() =>
            setOpen(true)
          }
        >
          Handlekurv · {nok(total)}
        </button>
      )}

      {open && (
        <div
          className="drawer"
          onMouseDown={(e) =>
            e.target ===
              e.currentTarget &&
            setOpen(false)
          }
        >
          <div className="drawerPanel">
            <div className="row">
              <h2>Handlekurv</h2>

              <button
                className="btn alt"
                onClick={() =>
                  setOpen(false)
                }
              >
                Lukk
              </button>
            </div>

            {message && (
              <div className="success">
                <b>
                  Bestilling mottatt
                </b>

                <p>
                  Ordrenummer:{" "}
                  {
                    message.orderNumber
                  }
                </p>

                <p>
                  {message.message}
                </p>
              </div>
            )}

            {cart.map((item) => (
              <div
                className="card"
                key={item.key}
                style={{
                  marginBottom: 10,
                }}
              >
                <div className="row">
                  <div>
                    <b>{item.name}</b>

                    <div className="muted">
                      {Object.values(
                        item.selectedOptions
                      ).join(" · ")}
                    </div>
                  </div>

                  <b>
                    {nok(
                      item.unitPriceOre *
                        item.quantity
                    )}
                  </b>
                </div>

                <div
                  className="row"
                  style={{
                    marginTop: 12,
                  }}
                >
                  <span>
                    Antall:{" "}
                    {item.quantity}
                  </span>

                  <div>
                    <button
                      className="btn alt"
                      onClick={() =>
                        setCart(
                          (current) =>
                            current
                              .map(
                                (
                                  x
                                ) =>
                                  x.key ===
                                  item.key
                                    ? {
                                        ...x,
                                        quantity:
                                          x.quantity -
                                          1,
                                      }
                                    : x
                              )
                              .filter(
                                (
                                  x
                                ) =>
                                  x.quantity >
                                  0
                              )
                        )
                      }
                    >
                      −
                    </button>{" "}

                    <button
                      className="btn alt"
                      onClick={() =>
                        setCart(
                          (current) =>
                            current.map(
                              (x) =>
                                x.key ===
                                item.key
                                  ? {
                                      ...x,
                                      quantity:
                                        x.quantity +
                                        1,
                                    }
                                  : x
                            )
                        )
                      }
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            ))}

            <div className="row">
              <b>Totalt</b>
              <b>{nok(total)}</b>
            </div>

            <div className="line" />

            <form onSubmit={order}>
              <CustomerFields
                customer={customer}
                setCustomer={
                  setCustomer
                }
              />

              <div className="field">
                <label>
                  Henting eller
                  levering
                </label>

                <select
                  value={fulfillment}
                  onChange={(e) =>
                    setFulfillment(
                      e.target.value
                    )
                  }
                >
                  <option value="pickup">
                    Henting
                  </option>

                  <option value="delivery">
                    Levering innen 15
                    km
                  </option>
                </select>
              </div>

              {error && (
                <p className="notice">
                  {error}
                </p>
              )}

              <button
                className="btn"
                disabled={!cart.length}
              >
                Send bestilling
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

function Product({
  p,
  add,
}) {
  const initial =
    Object.fromEntries(
      (p.options || []).map(
        (option) => [
          option.id,
          option.choices?.[0]
            ?.value || "",
        ]
      )
    );

  const [sel, setSel] =
    useState(initial);

  const price = useMemo(
    () => productPrice(p, sel),
    [p, sel]
  );

  return (
    <article className="card">
      {p.imageUrl && (
        <img
          src={p.imageUrl}
          alt={p.name}
          style={{
            width: "100%",
            height: 260,
            objectFit: "cover",
            borderRadius: 14,
            marginBottom: 18,
            display: "block",
          }}
        />
      )}

      <div className="kicker">
        {p.eyebrow ||
          p.category ||
          "På bestilling"}
      </div>

      <h3>{p.name}</h3>

      <p className="muted">
        {p.description}
      </p>

      <div className="options">
        {(p.options || []).map(
          (option) => (
            <div
              className="field"
              key={option.id}
            >
              <label>
                {option.label}
              </label>

              <select
                value={
                  sel[option.id]
                }
                onChange={(e) =>
                  setSel((current) => ({
                    ...current,
                    [option.id]:
                      e.target.value,
                  }))
                }
              >
                {option.choices.map(
                  (choice) => (
                    <option
                      key={
                        choice.value
                      }
                      value={
                        choice.value
                      }
                    >
                      {choice.label}
                      {choice.extraOre
                        ? ` (+${nok(
                            choice.extraOre
                          )})`
                        : ""}
                    </option>
                  )
                )}
              </select>
            </div>
          )
        )}
      </div>

      <div className="row">
        <div className="price">
          {nok(price)}
        </div>

        <button
          className="btn"
          onClick={() =>
            add(p, sel)
          }
        >
          Legg i kurv
        </button>
      </div>
    </article>
  );
}

function CustomerFields({
  customer,
  setCustomer,
}) {
  const set = (key, value) =>
    setCustomer((current) => ({
      ...current,
      [key]: value,
    }));

  return (
    <div className="options">
      <div className="field">
        <label>Navn</label>

        <input
          required
          value={customer.name}
          onChange={(e) =>
            set(
              "name",
              e.target.value
            )
          }
        />
      </div>

      <div className="field">
        <label>E-post</label>

        <input
          type="email"
          required
          value={customer.email}
          onChange={(e) =>
            set(
              "email",
              e.target.value
            )
          }
        />
      </div>

      <div className="field">
        <label>Telefon</label>

        <input
          required
          value={customer.phone}
          onChange={(e) =>
            set(
              "phone",
              e.target.value
            )
          }
        />
      </div>

      <div className="field">
        <label>Adresse</label>

        <input
          value={customer.address}
          onChange={(e) =>
            set(
              "address",
              e.target.value
            )
          }
        />
      </div>

      <div className="field">
        <label>
          Postnummer
        </label>

        <input
          value={
            customer.postalCode
          }
          onChange={(e) =>
            set(
              "postalCode",
              e.target.value
            )
          }
        />
      </div>

      <div className="field">
        <label>Sted</label>

        <input
          value={customer.city}
          onChange={(e) =>
            set(
              "city",
              e.target.value
            )
          }
        />
      </div>

      <div className="field">
        <label>Merknad</label>

        <textarea
          rows="3"
          value={customer.note}
          onChange={(e) =>
            set(
              "note",
              e.target.value
            )
          }
        />
      </div>
    </div>
  );
}
