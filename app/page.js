"use client";

import { useState } from "react";

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
  const [customer, setCustomer] =
    useState(emptyCustomer);

  const [custom, setCustom] =
    useState("");

  const [message, setMessage] =
    useState(null);

  const [error, setError] =
    useState("");

  const [sending, setSending] =
    useState(false);

  async function customOrder(e) {
    e.preventDefault();

    setError("");
    setMessage(null);
    setSending(true);

    try {
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

            customRequest:
              custom,

            customer,

            fulfillmentType:
              "pickup",

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
      setCustomer(
        emptyCustomer
      );
    } catch {
      setError(
        "Noe gikk galt. Prøv igjen."
      );
    } finally {
      setSending(false);
    }
  }

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
            <a href="/produkter">
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

            <a
              className="btn"
              href="/produkter"
            >
              Se produkter
            </a>
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
              flexWrap: "wrap",
            }}
          >
            <a
              className="btn"
              href="/produkter"
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
            Velg blant produktene
            våre eller få laget noe
            etter egne mål og ønsker.
          </p>

          <a
            className="btn"
            href="/produkter"
            style={{
              marginTop: 14,
              display:
                "inline-block",
            }}
          >
            Utforsk produkter
          </a>
        </div>
      </section>

      <section
        className="section"
        style={{
          background:
            "#f4f0e8",
        }}
      >
        <div className="wrap">
          <div className="kicker">
            Produkter
          </div>

          <h2>
            Finn riktig løsning.
          </h2>

          <p
            className="muted"
            style={{
              maxWidth: 680,
            }}
          >
            Produktene våre er
            samlet i kategorier slik
            at du enkelt kan finne
            det du ser etter. Velg
            produkt, størrelse,
            utførelse og andre
            tilgjengelige varianter
            på produktsiden.
          </p>

          <div
            className="grid"
            style={{
              marginTop: 30,
            }}
          >
            <div className="card">
              <div className="kicker">
                01
              </div>

              <h3>
                Velg kategori
              </h3>

              <p className="muted">
                Finn for eksempel
                benker,
                plantekasser, bord
                eller andre
                produkter.
              </p>
            </div>

            <div className="card">
              <div className="kicker">
                02
              </div>

              <h3>
                Velg produkt
              </h3>

              <p className="muted">
                Sammenlign ulike
                modeller og
                systemer innenfor
                samme kategori.
              </p>
            </div>

            <div className="card">
              <div className="kicker">
                03
              </div>

              <h3>
                Tilpass
              </h3>

              <p className="muted">
                Velg tilgjengelige
                mål, overflate og
                andre varianter før
                bestilling.
              </p>
            </div>
          </div>

          <div
            style={{
              marginTop: 28,
            }}
          >
            <a
              className="btn"
              href="/produkter"
            >
              Se alle produkter
            </a>
          </div>
        </div>
      </section>

      <section
        id="slik"
        className="section"
        style={{
          background:
            "#eee8dd",
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
              {
                number: "01",

                title:
                  "Velg eller beskriv",

                text:
                  "Velg et produkt fra nettbutikken og tilpass tilgjengelige varianter, eller send oss en egen forespørsel.",
              },

              {
                number: "02",

                title:
                  "Vi bekrefter bestillingen",

                text:
                  "Vi går gjennom bestillingen og tar kontakt dersom noe må avklares før vi starter.",
              },

              {
                number: "03",

                title:
                  "Hent eller få levert",

                text:
                  "Store produkter hentes etter avtale eller leveres innenfor avtalt område.",
              },
            ].map((item) => (
              <div
                className="card"
                key={item.number}
              >
                <b>
                  {item.number}
                </b>

                <h3>
                  {item.title}
                </h3>

                <p className="muted">
                  {item.text}
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

          <p
            className="muted"
            style={{
              maxWidth: 680,
              marginBottom: 28,
            }}
          >
            Finner du ikke det du
            trenger blant
            produktene våre? Send
            oss en beskrivelse av
            det du ønsker, så tar
            vi kontakt.
          </p>

          {message && (
            <div
              className="success"
              style={{
                maxWidth: 720,
                marginBottom: 20,
              }}
            >
              <b>
                Forespørselen er
                mottatt
              </b>

              {message.orderNumber && (
                <p>
                  Ordrenummer:{" "}
                  {
                    message.orderNumber
                  }
                </p>
              )}

              {message.message && (
                <p>
                  {message.message}
                </p>
              )}
            </div>
          )}

          <form
            className="card"
            onSubmit={
              customOrder
            }
            style={{
              maxWidth: 720,
            }}
          >
            <div className="field">
              <label>
                Beskriv hva du
                ønsker
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

            {error && (
              <p className="notice">
                {error}
              </p>
            )}

            <button
              className="btn"
              disabled={sending}
            >
              {sending
                ? "Sender..."
                : "Send forespørsel"}
            </button>
          </form>
        </div>
      </section>

      <section
        id="om"
        className="section"
        style={{
          background:
            "#181613",
          color: "white",
        }}
      >
        <div className="wrap">
          <div className="kicker">
            Om Aadland Service
          </div>

          <h2>
            Praktiske løsninger.
            <br />
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
            vedlikehold og
            produkter på
            bestilling i Bergen og
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
