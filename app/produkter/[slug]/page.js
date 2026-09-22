"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { CatalogFooter, CatalogHeader, CatalogPlaceholder } from "../ProductChrome";
import {
  nok,
  productPrice,
} from "../../../lib/catalog";

export default function ProductPage() {
  const params = useParams();
  const slug = decodeURIComponent(String(params?.slug || ""));

  const [products, setProducts] = useState([]);
  const [loadError,setLoadError]=useState("");
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(0);
  const [selected, setSelected] = useState({});
  const [quantity, setQuantity] = useState(1);
  const [showOrder, setShowOrder] = useState(false);

  const [customer, setCustomer] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    postalCode: "",
    city: "",
    note: "",
    deliveryWithinRadius: true,
  });

  const [fulfillment, setFulfillment] = useState("pickup");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState(null);
  const [acceptedTerms,setAcceptedTerms]=useState(false);

  useEffect(() => {
    fetch("/api/products")
      .then(async(response)=>{const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||"Produktet kunne ikke hentes.");return data})
      .then((data) => { if (Array.isArray(data?.products)) setProducts(data.products); })
      .catch((e) => setLoadError(e.message||"Produktet kunne ikke hentes."))
      .finally(() => setLoading(false));
  }, []);

  const product = useMemo(
    () =>
      products.find(
        (item) =>
          String(item.slug || item.id) === slug &&
          item.active !== false
      ),
    [products, slug]
  );

  const images = useMemo(() => {
    if (!product) return [];

    if (Array.isArray(product.imageUrls) && product.imageUrls.length) {
      return product.imageUrls;
    }

    if (product.imageUrl) {
      return [product.imageUrl];
    }

    return [];
  }, [product]);

  useEffect(() => {
    if (!product) return;

    const initial = Object.fromEntries(
      (product.options || []).map((option) => [
        option.id,
        option.choices?.[0]?.value || "",
      ])
    );

    setSelected(initial);
    setSelectedImage(0);
  }, [product]);

  const price = useMemo(() => {
    if (!product) return 0;
    return productPrice(product, selected);
  }, [product, selected]);

  const shippingOre = fulfillment === "shipping" && product?.shippable ? (Number(product.shippingPriceOre)||0)*quantity : 0;
  const total = price * quantity + shippingOre;
  const soldOut = product?.inventoryMode === "stock" && Number(product.stockQuantity) <= 0;
  const maxQuantity = product?.inventoryMode === "stock" ? Math.max(0,Math.min(10,Number(product.stockQuantity)||0)) : 10;

  async function sendOrder(e) {
    e.preventDefault();

    if (!product) return;

    setError("");
    setMessage(null);
    setSending(true);

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orderType: "order",
          customer,
          fulfillmentType: fulfillment,
          deliveryWithinRadius: customer.deliveryWithinRadius,
          acceptedTerms,
          termsVersion: "2026-09",
          items: [
            {
              productId: product.id,
              quantity,
              selectedOptions: selected,
            },
          ],
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Bestillingen kunne ikke sendes.");
        return;
      }

      setMessage(data);
      setShowOrder(false);
    } catch {
      setError("Bestillingen kunne ikke sendes. Prøv igjen.");
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <main className="catalogPage productDetailPage">
        <CatalogHeader />
        <section className="section productStateSection">
          <div className="wrap">
            <div className="catalogStatus">Henter produkt …</div>
          </div>
        </section>
        <CatalogFooter />
      </main>
    );
  }

  if (loadError) {return <main className="catalogPage productDetailPage"><CatalogHeader/><section className="section productStateSection"><div className="wrap"><div className="catalogNotice catalogNoticeLarge"><b>Noe gikk galt</b><p>{loadError}</p><a className="catalogGoldButton" href="/produkter">Tilbake til produkter →</a></div></div></section><CatalogFooter/></main>}

  if (!product) {
    return (
      <main className="catalogPage productDetailPage">
        <CatalogHeader />
        <section className="section">
          <div className="wrap">
            <div className="card">
              <div className="kicker">Produkt</div>
              <h1>Produktet ble ikke funnet</h1>
              <p className="muted">
                Produktet kan ha blitt fjernet eller skjult.
              </p>
              <a className="btn" href="/produkter">
                Tilbake til produkter
              </a>
            </div>
          </div>
        </section>
        <CatalogFooter />
      </main>
    );
  }

  return (
    <main className="catalogPage productDetailPage">
      <CatalogHeader />

      <section className="section productIntroSection" style={{ paddingTop: 45 }}>
        <div className="wrap">
          <div style={{ marginBottom: 28 }}>
            <a
              href="/produkter"
              className="muted"
              style={{ textDecoration: "none" }}
            >
              ← Tilbake til produkter
            </a>
          </div>

          <div
            className="productLayout premiumProductLayout"
            style={{
              display: "grid",
              gridTemplateColumns:
                "minmax(0, 1.15fr) minmax(320px, 0.85fr)",
              gap: 48,
              alignItems: "start",
            }}
          >
            <div>
              {images.length > 0 ? (
                <>
                  <div
                    style={{
                      background: "#f1ede5",
                      borderRadius: 18,
                      overflow: "hidden",
                    }}
                  >
                    <img
                      src={images[selectedImage] || images[0]}
                      alt={product.name}
                      style={{
                        width: "100%",
                        height: 520,
                        objectFit: "cover",
                        display: "block",
                      }}
                    />
                  </div>

                  {images.length > 1 && (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fill, minmax(90px, 1fr))",
                        gap: 10,
                        marginTop: 12,
                      }}
                    >
                      {images.map((image, index) => (
                        <button
                          key={`${image}-${index}`}
                          type="button"
                          onClick={() => setSelectedImage(index)}
                          style={{
                            padding: 0,
                            border:
                              index === selectedImage
                                ? "2px solid #d7a74e"
                                : "2px solid rgba(255,255,255,.12)",
                            borderRadius: 10,
                            overflow: "hidden",
                            cursor: "pointer",
                            background: "transparent",
                          }}
                        >
                          <img
                            src={image}
                            alt={`${product.name} ${index + 1}`}
                            style={{
                              width: "100%",
                              height: 90,
                              objectFit: "cover",
                              display: "block",
                            }}
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="productDetailPlaceholder">
                  <CatalogPlaceholder label="Produktbilde kommer" />
                </div>
              )}
            </div>

            <div className="productPurchasePanel">
              <div className="kicker">
                {product.category || "På bestilling"}
              </div>

              <h1 style={{ marginBottom: 16 }}>{product.name}</h1>

              {product.description && (
                <p
                  className="muted"
                  style={{
                    fontSize: 17,
                    lineHeight: 1.7,
                    whiteSpace: "pre-line",
                  }}
                >
                  {product.description}
                </p>
              )}

              <div style={{ margin: "28px 0" }}>
                <small className="muted">Pris</small>

                <div className="price" style={{ fontSize: 34 }}>
                  {nok(price)}
                </div>

                <small className="muted">inkl. mva.</small>
              </div>

              {(product.options || []).length > 0 && (
                <div style={{ marginBottom: 26 }}>
                  <div className="kicker" style={{ marginBottom: 12 }}>
                    Varianter
                  </div>

                  {(product.options || []).map((option) => (
                    <div className="field" key={option.id}>
                      <label>{option.label}</label>

                      <select
                        value={selected[option.id] || ""}
                        onChange={(e) =>
                          setSelected((current) => ({
                            ...current,
                            [option.id]: e.target.value,
                          }))
                        }
                      >
                        {(option.choices || []).map((choice) => (
                          <option key={choice.value} value={choice.value}>
                            {choice.label}
                            {choice.extraOre
                              ? ` (+${nok(choice.extraOre)})`
                              : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}

              <div className="field" style={{ maxWidth: 140 }}>
                <label>Antall</label>

                <select
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                >
                  {Array.from({length:maxQuantity||1},(_,i)=>i+1).map((number) => (
                    <option key={number} value={number}>
                      {number}
                    </option>
                  ))}
                </select>
              </div>

              {quantity > 1 && (
                <p style={{ marginTop: 12 }}>
                  <b>Totalt: {nok(total)}</b>
                </p>
              )}

              <div className={"productAvailability " + (soldOut ? "isSoldOut" : "")}>
                <span className="productAvailabilityDot" />
                <span>
                  {product.inventoryMode==="stock"
                    ? <><b>{soldOut?"Utsolgt":product.stockQuantity+" på lager"}</b>{soldOut&&product.restockDate?<> · forventet tilbake {new Date(product.restockDate+"T12:00:00").toLocaleDateString("nb-NO")}</>:null}</>
                    : <><b>Produseres på bestilling</b>{product.leadTimeText?" · "+product.leadTimeText:""}</>}
                </span>
              </div>
              <button
                className="btn catalogOrderButton"
                disabled={soldOut}
                onClick={() => {
                  setError("");
                  setMessage(null);
                  setShowOrder(true);
                }}
                style={{
                  marginTop: 14,
                  width: "100%",
                }}
              >
                Bestill
              </button>

              <div className="productAssurances">
                <span>✓ Henting etter avtale</span>
                <span>✓ Levering etter tilgjengelighet</span>
                <span>✓ Pris inkl. mva.</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {(product.dimensions ||
        (product.specifications || []).length > 0) && (
        <section
          className="section productSpecsSection"
          style={{ background: "#eee8dd" }}
        >
          <div className="wrap">
            <div className="kicker">Produktinformasjon</div>
            <h2>Mål og spesifikasjoner</h2>

            <div className="grid productSpecsGrid" style={{ marginTop: 28 }}>
              {product.dimensions && (
                <div className="card">
                  <h3>Mål</h3>
                  <p
                    style={{
                      whiteSpace: "pre-line",
                      lineHeight: 1.7,
                    }}
                  >
                    {product.dimensions}
                  </p>
                </div>
              )}

              {(product.specifications || []).length > 0 && (
                <div className="card">
                  <h3>Spesifikasjoner</h3>

                  <div style={{ marginTop: 16 }}>
                    {product.specifications.map((item, index) => (
                      <div
                        key={index}
                        className="row"
                        style={{
                          padding: "11px 0",
                          borderBottom: "1px solid rgba(0,0,0,.1)",
                          gap: 20,
                        }}
                      >
                        <span className="muted">{item.label}</span>
                        <b>{item.value}</b>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="section productCustomSection">
        <div className="wrap">
          <div className="kicker">Aadland Service</div>
          <h2>Trenger du en annen løsning?</h2>

          <p className="muted" style={{ maxWidth: 650 }}>
            Vi kan også lage produkter etter andre mål og ønsker.
          </p>

          <a className="catalogGoldButton" href="/#befaring" style={{ marginTop: 18 }}>
            Send forespørsel →
          </a>
        </div>
      </section>

      <CatalogFooter />

      {showOrder && (
        <div
          className="drawer"
          onMouseDown={(e) =>
            e.target === e.currentTarget && setShowOrder(false)
          }
        >
          <div className="drawerPanel">
            <div className="row">
              <div>
                <div className="kicker">Bestilling</div>
                <h2 style={{ marginBottom: 0 }}>{product.name}</h2>
              </div>

              <button
                type="button"
                className="drawerCloseButton"
                aria-label="Lukk bestilling"
                onClick={() => setShowOrder(false)}
              >
                ×
              </button>
            </div>

            <div className="card" style={{ margin: "20px 0" }}>
              <div className="row">
                <div>
                  <b>{product.name}</b>

                  {Object.keys(selected).length > 0 && (
                    <div className="muted" style={{ marginTop: 5 }}>
                      {selectedLabels(product, selected)}
                    </div>
                  )}

                  <div className="muted">Antall: {quantity}</div>
                </div>

                <b>{nok(total)}</b>
              </div>
            </div>

            <form onSubmit={sendOrder}>
              <CustomerFields
                customer={customer}
                setCustomer={setCustomer}
              />

              <div className="field">
                <label>Henting eller levering</label>

                <select
                  value={fulfillment}
                  onChange={(e) => setFulfillment(e.target.value)}
                >
                  <option value="pickup">Henting</option>
                  <option value="delivery">Levering innen 15 km</option>{product.shippable&&<option value="shipping">Send med post/Bring{product.shippingPriceOre?` (+${nok(product.shippingPriceOre)})`:""}</option>}
                </select>
              </div>

              <label style={{display:"flex",gap:8,alignItems:"flex-start",margin:"14px 0"}}><input type="checkbox" required checked={acceptedTerms} onChange={e=>setAcceptedTerms(e.target.checked)}/><span>Jeg godtar <a href="/vilkar/salg" target="_blank" rel="noreferrer">salgsbetingelsene</a>.</span></label>

              {error && <p className="notice">{error}</p>}

              <button
                className="btn drawerSubmitButton"
                disabled={sending}
                style={{ width: "100%" }}
              >
                {sending
                  ? "Sender..."
                  : `Send bestilling · ${nok(total)}`}
              </button>
            </form>
          </div>
        </div>
      )}

      {message && (
        <div
          className="drawer"
          onMouseDown={(e) =>
            e.target === e.currentTarget && setMessage(null)
          }
        >
          <div className="drawerPanel">
            <div className="success">
              <b>Bestilling mottatt</b>

              {message.orderNumber && (
                <p>Ordrenummer: {message.orderNumber}</p>
              )}

              {message.message && <p>{message.message}</p>}
            </div>

            <button
              className="btn"
              onClick={() => setMessage(null)}
              style={{ marginTop: 20 }}
            >
              Lukk
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function selectedLabels(product, selected) {
  return (product.options || [])
    .map((option) => {
      const choice = (option.choices || []).find(
        (item) => item.value === selected[option.id]
      );

      return choice?.label;
    })
    .filter(Boolean)
    .join(" · ");
}

function CustomerFields({ customer, setCustomer }) {
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
          onChange={(e) => set("name", e.target.value)}
        />
      </div>

      <div className="field">
        <label>E-post</label>
        <input
          type="email"
          required
          value={customer.email}
          onChange={(e) => set("email", e.target.value)}
        />
      </div>

      <div className="field">
        <label>Telefon</label>
        <input
          required
          value={customer.phone}
          onChange={(e) => set("phone", e.target.value)}
        />
      </div>

      <div className="field">
        <label>Adresse</label>
        <input
          value={customer.address}
          onChange={(e) => set("address", e.target.value)}
        />
      </div>

      <div className="field">
        <label>Postnummer</label>
        <input
          value={customer.postalCode}
          onChange={(e) => set("postalCode", e.target.value)}
        />
      </div>

      <div className="field">
        <label>Sted</label>
        <input
          value={customer.city}
          onChange={(e) => set("city", e.target.value)}
        />
      </div>

      <div className="field">
        <label>Merknad</label>
        <textarea
          rows="3"
          value={customer.note}
          onChange={(e) => set("note", e.target.value)}
        />
      </div>
    </div>
  );
}
