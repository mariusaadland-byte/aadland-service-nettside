"use client";

import { useEffect, useState } from "react";
import { nok } from "../../lib/catalog";
import { useRouter } from "next/navigation";

const labels = {
  new: "Ny",
  confirmed: "Bekreftet",
  in_progress: "Under arbeid",
  ready: "Klar",
  completed: "Ferdig",
  cancelled: "Avbrutt",
};

export default function AdminClient({ user }) {
  const [tab, setTab] = useState("overview");
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [services, setServices] = useState([]);
  const [users, setUsers] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(user?.id || "");
  const [error, setError] = useState("");

  const router = useRouter();

  const canViewOrders =
    user?.role === "owner" || Boolean(user?.canViewOrders);

  const canUpdateOrders =
    user?.role === "owner" || Boolean(user?.canUpdateOrders);

  const canManageProducts =
    user?.role === "owner" || Boolean(user?.canManageProducts);

  const canManageUsers =
    user?.role === "owner" || Boolean(user?.canManageUsers);

  const canEditUsers = user?.role === "owner";

  async function load() {
    setError("");

    if (canViewOrders) {
      const response = await fetch("/api/admin/orders");

      if (response.status === 401) {
        router.replace("/admin/login");
        return;
      }

      if (response.ok) {
        const data = await response.json();
        setOrders(data.orders || []);
      } else {
        const data = await response.json().catch(() => ({}));
        setError(data.error || "Bestillingene kunne ikke hentes.");
        setOrders([]);
      }
    } else {
      setOrders([]);
    }

    if (canManageProducts) {
      const response = await fetch("/api/admin/products");

      if (response.status === 401) {
        router.replace("/admin/login");
        return;
      }

      if (response.ok) {
        const data = await response.json();
        setProducts(data.products || []);
      } else {
        const data = await response.json().catch(() => ({}));
        setError(data.error || "Produktene kunne ikke hentes.");
        setProducts([]);
      }
    } else {
      setProducts([]);
    }

    if (canManageProducts) {
      const response = await fetch("/api/admin/categories");

      if (response.status === 401) {
        router.replace("/admin/login");
        return;
      }

      if (response.ok) {
        const data = await response.json();
        setCategories(data.categories || []);
      } else {
        const data = await response.json().catch(() => ({}));
        setError(data.error || "Kategoriene kunne ikke hentes.");
        setCategories([]);
      }
    } else {
      setCategories([]);
    }

    if (canManageProducts) {
      const response = await fetch("/api/admin/services");
      if (response.status === 401) { router.replace("/admin/login"); return; }
      if (response.ok) { const data = await response.json(); setServices(data.services || []); }
      else { const data = await response.json().catch(() => ({})); setError(data.error || "Tjenestene kunne ikke hentes."); setServices([]); }
    } else { setServices([]); }

    if (canManageUsers) {
      const response = await fetch("/api/admin/users");

      if (response.status === 401) {
        router.replace("/admin/login");
        return;
      }

      if (response.ok) {
        const data = await response.json();
        setUsers(data.users || []);
        setCurrentUserId(data.currentUserId || user?.id || "");
      } else {
        const data = await response.json().catch(() => ({}));
        setError(data.error || "Brukerne kunne ikke hentes.");
        setUsers([]);
      }
    } else {
      setUsers([]);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function status(id, newStatus) {
    if (!canUpdateOrders) {
      setError("Du har ikke tilgang til å endre bestillinger.");
      return;
    }

    setError("");

    const response = await fetch("/api/admin/orders", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id,
        status: newStatus,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      setError(data.error || "Status kunne ikke lagres.");
      return;
    }

    await load();
  }

  async function logout() {
    await fetch("/api/auth/logout", {
      method: "POST",
    });

    router.replace("/admin/login");
    router.refresh();
  }

  const fresh = orders.filter(
    (order) => order.status === "new"
  ).length;

  const working = orders.filter((order) =>
    ["confirmed", "in_progress", "ready"].includes(order.status)
  ).length;

  const total = orders.reduce(
    (sum, order) => sum + (order.totalOre || 0),
    0
  );

  const tabs = [["overview", "Oversikt"]];

  if (canViewOrders) tabs.push(["orders", "Bestillinger"]);
  if (canManageProducts) tabs.push(["products", "Produkter"]);
  if (canManageProducts) tabs.push(["categories", "Kategorier"]);
  if (canManageProducts) tabs.push(["services", "Tjenester"]);
  if (canManageUsers) tabs.push(["users", "Brukere"]);

  return (
    <main className="admin">
      <aside className="side">
        <div className="brand">
          <span className="mark">AS</span>
          Aadland
        </div>

        {tabs.map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            {label}
            {id === "orders" && fresh ? ` (${fresh})` : ""}
          </button>
        ))}

        <button onClick={logout}>Logg ut</button>
      </aside>

      <section className="adminmain">
        <div className="kicker">
          Aadland Service / Back office
        </div>

        <h1>
          {tab === "overview"
            ? "Oversikt"
            : tab === "orders"
            ? "Bestillinger"
            : tab === "products"
            ? "Produkter"
            : tab === "categories"
            ? "Kategorier"
            : tab === "services"
            ? "Tjenester"
            : "Brukere"}
        </h1>

        {error && <p className="notice">{error}</p>}

        {tab === "overview" && (
          <>
            <div className="stats">
              {canViewOrders && (
                <>
                  <div className="stat">
                    <span className="muted">Nye ordre</span>
                    <br />
                    <b>{fresh}</b>
                  </div>

                  <div className="stat">
                    <span className="muted">
                      Under behandling
                    </span>
                    <br />
                    <b>{working}</b>
                  </div>
                </>
              )}

              {canManageProducts && (
                <>
                  <div className="stat">
                    <span className="muted">
                      Aktive produkter
                    </span>
                    <br />
                    <b>
                      {
                        products.filter(
                          (product) => product.active !== false
                        ).length
                      }
                    </b>
                  </div>

                  <div className="stat">
                    <span className="muted">
                      Aktive kategorier
                    </span>
                    <br />
                    <b>
                      {
                        categories.filter(
                          (category) => category.active !== false
                        ).length
                      }
                    </b>
                  </div>
                </>
              )}

              {canViewOrders && (
                <div className="stat">
                  <span className="muted">
                    Ordreverdi
                  </span>
                  <br />
                  <b>{nok(total)}</b>
                </div>
              )}
            </div>

            {canViewOrders && (
              <Orders
                orders={orders.slice(0, 5)}
                status={status}
                canUpdateOrders={canUpdateOrders}
              />
            )}

            {!canViewOrders && (
              <div className="card">
                <h3>Velkommen</h3>
                <p className="muted">
                  Du er logget inn i Aadland Service
                  backoffice. Menyen viser funksjonene du
                  har fått tilgang til.
                </p>
              </div>
            )}
          </>
        )}

        {tab === "orders" && canViewOrders && (
          <Orders
            orders={orders}
            status={status}
            canUpdateOrders={canUpdateOrders}
          />
        )}

        {tab === "products" && canManageProducts && (
          <Products
            products={products}
            categories={categories}
            reload={load}
            setError={setError}
          />
        )}

        {tab === "categories" && canManageProducts && (
          <Categories
            categories={categories}
            products={products}
            reload={load}
            setError={setError}
          />
        )}

        {tab === "services" && canManageProducts && (
          <Services services={services} reload={load} setError={setError} />
        )}

        {tab === "users" && canManageUsers && (
          <Users
            users={users}
            currentUserId={currentUserId}
            reload={load}
            setError={setError}
            canEditUsers={canEditUsers}
          />
        )}
      </section>
    </main>
  );
}

function Orders({ orders, status, canUpdateOrders }) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Ordre</th>
          <th>Kunde</th>
          <th>Type</th>
          <th>Levering</th>
          <th>Sum</th>
          <th>Status</th>
        </tr>
      </thead>

      <tbody>
        {orders.map((order) => (
          <tr key={order.id}>
            <td>
              <b>{order.orderNumber}</b>
              <br />
              <small>
                {new Date(order.createdAt).toLocaleString(
                  "nb-NO"
                )}
              </small>
            </td>

            <td>
              {order.customerName}
              <br />
              <small>{order.customerEmail}</small>
            </td>

            <td>
              {order.orderType === "custom"
                ? "Forespørsel"
                : "Produkt"}
            </td>

            <td>
              {order.fulfillmentType === "delivery"
                ? "Levering"
                : "Henting"}
            </td>

            <td>{nok(order.totalOre || 0)}</td>

            <td>
              {canUpdateOrders ? (
                <select
                  value={order.status}
                  onChange={(e) =>
                    status(order.id, e.target.value)
                  }
                >
                  {Object.entries(labels).map(
                    ([value, label]) => (
                      <option value={value} key={value}>
                        {label}
                      </option>
                    )
                  )}
                </select>
              ) : (
                <span>
                  {labels[order.status] || order.status}
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Products({
  products,
  categories,
  reload,
  setError,
}) {
  const [showNew, setShowNew] = useState(false);

  return (
    <>
      <div style={{ marginBottom: 20 }}>
        <button
          className="btn"
          onClick={() => setShowNew(!showNew)}
        >
          {showNew ? "Avbryt" : "Legg til produkt"}
        </button>
      </div>

      {showNew && (
        <ProductEditor
          product={null}
          categories={categories}
          reload={reload}
          setError={setError}
          close={() => setShowNew(false)}
        />
      )}

      <div className="grid">
        {products.map((product) => (
          <ProductEditor
            key={product.id}
            product={product}
            categories={categories}
            reload={reload}
            setError={setError}
          />
        ))}
      </div>
    </>
  );
}

function ProductEditor({
  product,
  categories,
  reload,
  setError,
  close,
}) {
  const isNew = !product;

  const [editing, setEditing] = useState(isNew);
  const [name, setName] = useState(product?.name || "");
  const [categoryId, setCategoryId] = useState(
    product?.categoryId || ""
  );
  const [description, setDescription] = useState(
    product?.description || ""
  );
  const [dimensions, setDimensions] = useState(
    product?.dimensions || ""
  );

  const [price, setPrice] = useState(
    product
      ? String((Number(product.basePriceOre) || 0) / 100)
      : ""
  );

  const [imageUrls, setImageUrls] = useState(
    Array.isArray(product?.imageUrls) &&
      product.imageUrls.length
      ? product.imageUrls
      : product?.imageUrl
      ? [product.imageUrl]
      : []
  );

  const [specifications, setSpecifications] = useState(
    Array.isArray(product?.specifications)
      ? product.specifications
      : []
  );

  const [options, setOptions] = useState(
    Array.isArray(product?.options)
      ? product.options
      : []
  );

  const [active, setActive] = useState(
    product?.active !== false
  );

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  function resetFromProduct() {
    if (!product) return;

    setName(product.name || "");
    setCategoryId(product.categoryId || "");
    setDescription(product.description || "");
    setDimensions(product.dimensions || "");

    setPrice(
      String((Number(product.basePriceOre) || 0) / 100)
    );

    setImageUrls(
      Array.isArray(product.imageUrls) &&
        product.imageUrls.length
        ? product.imageUrls
        : product.imageUrl
        ? [product.imageUrl]
        : []
    );

    setSpecifications(
      Array.isArray(product.specifications)
        ? product.specifications
        : []
    );

    setOptions(
      Array.isArray(product.options)
        ? product.options
        : []
    );

    setActive(product.active !== false);
  }

  useEffect(() => {
    resetFromProduct();
  }, [product]);

  async function uploadImages(files) {
    const selected = Array.from(files || []);

    if (!selected.length) return;

    setUploading(true);
    setError("");

    const uploaded = [];

    for (const file of selected) {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(
        "/api/admin/upload",
        {
          method: "POST",
          body: formData,
        }
      );

      const data = await response
        .json()
        .catch(() => ({}));

      if (!response.ok) {
        setUploading(false);
        setError(
          data.error ||
            "Et av bildene kunne ikke lastes opp."
        );
        return;
      }

      if (data.url) {
        uploaded.push(data.url);
      }
    }

    setImageUrls((current) => [
      ...current,
      ...uploaded,
    ]);

    setUploading(false);
  }

  function moveImage(index, direction) {
    setImageUrls((current) => {
      const next = [...current];
      const target = index + direction;

      if (
        target < 0 ||
        target >= next.length
      ) {
        return current;
      }

      [next[index], next[target]] = [
        next[target],
        next[index],
      ];

      return next;
    });
  }

  function addSpecification() {
    setSpecifications((current) => [
      ...current,
      {
        label: "",
        value: "",
      },
    ]);
  }

  function updateSpecification(
    index,
    key,
    value
  ) {
    setSpecifications((current) =>
      current.map((item, i) =>
        i === index
          ? {
              ...item,
              [key]: value,
            }
          : item
      )
    );
  }

  function removeSpecification(index) {
    setSpecifications((current) =>
      current.filter((_, i) => i !== index)
    );
  }

  function addOption() {
    setOptions((current) => [
      ...current,
      {
        id: `variant-${Date.now()}-${current.length}`,
        label: "",
        choices: [],
      },
    ]);
  }

  function updateOption(index, key, value) {
    setOptions((current) =>
      current.map((option, i) =>
        i === index
          ? {
              ...option,
              [key]: value,
            }
          : option
      )
    );
  }

  function removeOption(index) {
    setOptions((current) =>
      current.filter((_, i) => i !== index)
    );
  }

  function addChoice(optionIndex) {
    setOptions((current) =>
      current.map((option, i) =>
        i === optionIndex
          ? {
              ...option,
              choices: [
                ...(Array.isArray(option.choices)
                  ? option.choices
                  : []),
                {
                  value: "",
                  label: "",
                  extraOre: 0,
                },
              ],
            }
          : option
      )
    );
  }

  function updateChoice(
    optionIndex,
    choiceIndex,
    key,
    value
  ) {
    setOptions((current) =>
      current.map((option, i) => {
        if (i !== optionIndex) {
          return option;
        }

        const choices = Array.isArray(
          option.choices
        )
          ? option.choices
          : [];

        return {
          ...option,
          choices: choices.map(
            (choice, j) =>
              j === choiceIndex
                ? {
                    ...choice,
                    [key]: value,
                  }
                : choice
          ),
        };
      })
    );
  }

  function removeChoice(
    optionIndex,
    choiceIndex
  ) {
    setOptions((current) =>
      current.map((option, i) => {
        if (i !== optionIndex) {
          return option;
        }

        return {
          ...option,
          choices: (
            Array.isArray(option.choices)
              ? option.choices
              : []
          ).filter(
            (_, j) => j !== choiceIndex
          ),
        };
      })
    );
  }

  function cleanedSpecifications() {
    return specifications
      .map((item) => ({
        label: String(
          item.label || ""
        ).trim(),
        value: String(
          item.value || ""
        ).trim(),
      }))
      .filter(
        (item) =>
          item.label && item.value
      );
  }

  function cleanedOptions() {
    return options
      .map((option, optionIndex) => {
        const label = String(
          option.label || ""
        ).trim();

        const id =
          String(
            option.id || ""
          ).trim() ||
          `variant-${optionIndex + 1}`;

        const choices = (
          Array.isArray(option.choices)
            ? option.choices
            : []
        )
          .map((choice) => {
            const choiceLabel =
              String(
                choice.label || ""
              ).trim();

            const value =
              String(
                choice.value || ""
              ).trim() ||
              choiceLabel
                .toLowerCase()
                .replace(
                  /[^a-z0-9æøå]+/gi,
                  "-"
                )
                .replace(/^-|-$/g, "");

            const extraNumber =
              Number(
                String(
                  choice.extraNok !==
                    undefined
                    ? choice.extraNok
                    : (Number(
                        choice.extraOre
                      ) || 0) / 100
                ).replace(",", ".")
              );

            return {
              value,
              label: choiceLabel,
              extraOre:
                Number.isFinite(
                  extraNumber
                )
                  ? Math.round(
                      extraNumber * 100
                    )
                  : 0,
            };
          })
          .filter(
            (choice) => choice.label
          );

        return {
          id,
          label,
          choices,
        };
      })
      .filter(
        (option) =>
          option.label &&
          option.choices.length
      );
  }

  async function save(e) {
    e?.preventDefault();

    setError("");

    const priceNumber = Number(
      String(price).replace(",", ".")
    );

    if (!name.trim()) {
      setError(
        "Produktet må ha et navn."
      );
      return;
    }

    if (
      !Number.isFinite(priceNumber) ||
      priceNumber < 0
    ) {
      setError(
        "Skriv inn en gyldig pris."
      );
      return;
    }

    if (!categoryId) {
      setError("Velg en kategori.");
      return;
    }

    setSaving(true);

    const response = await fetch(
      "/api/admin/products",
      {
        method: isNew
          ? "POST"
          : "PATCH",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          ...(isNew
            ? {}
            : {
                id: product.id,
              }),

          name: name.trim(),

          categoryId,

          description:
            description.trim(),

          dimensions:
            dimensions.trim(),

          basePriceOre:
            Math.round(
              priceNumber * 100
            ),

          imageUrl:
            imageUrls[0] || null,

          imageUrls,

          specifications:
            cleanedSpecifications(),

          options:
            cleanedOptions(),

          active,
        }),
      }
    );

    const data = await response
      .json()
      .catch(() => ({}));

    setSaving(false);

    if (!response.ok) {
      setError(
        data.error ||
          "Produktet kunne ikke lagres."
      );
      return;
    }

    if (isNew && close) {
      close();
    } else {
      setEditing(false);
    }

    await reload();
  }

  async function toggleActive() {
    setError("");
    setSaving(true);

    const existingImages =
      Array.isArray(
        product.imageUrls
      ) &&
      product.imageUrls.length
        ? product.imageUrls
        : product.imageUrl
        ? [product.imageUrl]
        : [];

    const response = await fetch(
      "/api/admin/products",
      {
        method: "PATCH",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          id: product.id,

          name:
            product.name || "",

          categoryId:
            product.categoryId,

          description:
            product.description || "",

          dimensions:
            product.dimensions || "",

          basePriceOre:
            Number(
              product.basePriceOre
            ) || 0,

          imageUrl:
            existingImages[0] ||
            null,

          imageUrls:
            existingImages,

          specifications:
            Array.isArray(
              product.specifications
            )
              ? product.specifications
              : [],

          options:
            Array.isArray(
              product.options
            )
              ? product.options
              : [],

          active:
            product.active === false,
        }),
      }
    );

    const data = await response
      .json()
      .catch(() => ({}));

    setSaving(false);

    if (!response.ok) {
      setError(
        data.error ||
          "Produktet kunne ikke lagres."
      );
      return;
    }

    await reload();
  }

  if (!editing && product) {
    const previewImage =
      (Array.isArray(
        product.imageUrls
      ) &&
        product.imageUrls[0]) ||
      product.imageUrl;

    return (
      <div className="card">
        {previewImage && (
          <img
            src={previewImage}
            alt={product.name}
            style={{
              width: "100%",
              height: 220,
              objectFit: "cover",
              borderRadius: 12,
              marginBottom: 16,
            }}
          />
        )}

        <div className="kicker">
          {product.category}
        </div>

        <h3>{product.name}</h3>

        <p>
          {product.description}
        </p>

        {product.dimensions && (
          <p className="muted">
            <b>Mål:</b>{" "}
            {product.dimensions}
          </p>
        )}

        <b>
          {nok(
            product.basePriceOre
          )}
        </b>

        <p
          className="muted"
          style={{
            marginTop: 10,
          }}
        >
          {product.imageUrls?.length ||
            (product.imageUrl
              ? 1
              : 0)}{" "}
          bilde(r)
          {" · "}
          {product.options?.length ||
            0}{" "}
          variantgruppe(r)
        </p>

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            marginTop: 18,
          }}
        >
          <button
            className="btn"
            onClick={() =>
              setEditing(true)
            }
          >
            Rediger
          </button>

          <button
            className="btn alt"
            onClick={toggleActive}
            disabled={saving}
          >
            {product.active ===
            false
              ? "Vis produkt"
              : "Skjul produkt"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="card"
      onSubmit={save}
      style={
        isNew
          ? {
              marginBottom: 20,
            }
          : undefined
      }
    >
      <div className="kicker">
        {isNew
          ? "Nytt produkt"
          : "Rediger produkt"}
      </div>

      <h3>
        {isNew
          ? "Legg til produkt"
          : product.name}
      </h3>

      <div className="field">
        <label>Produktnavn</label>

        <input
          required
          value={name}
          onChange={(e) =>
            setName(
              e.target.value
            )
          }
          placeholder="F.eks. Spilebenk"
        />
      </div>

      <div className="field">
        <label>Kategori</label>

        <select
          required
          value={categoryId}
          onChange={(e) =>
            setCategoryId(e.target.value)
          }
        >
          <option value="">
            Velg kategori
          </option>

          {categories
            .filter(
              (item) =>
                item.active !== false ||
                item.id === categoryId
            )
            .map((item) => (
              <option
                key={item.id}
                value={item.id}
              >
                {item.name}
                {item.active === false
                  ? " (skjult)"
                  : ""}
              </option>
            ))}
        </select>

        {!categories.length && (
          <small className="muted">
            Du må opprette en kategori under
            Kategorier først.
          </small>
        )}
      </div>

      <div className="field">
        <label>Beskrivelse</label>

        <textarea
          value={description}
          onChange={(e) =>
            setDescription(
              e.target.value
            )
          }
          rows={5}
          placeholder="Beskriv produktet"
          style={{
            width: "100%",
            resize: "vertical",
          }}
        />
      </div>

      <div className="field">
        <label>
          Faste mål / produktmål
        </label>

        <textarea
          value={dimensions}
          onChange={(e) =>
            setDimensions(
              e.target.value
            )
          }
          rows={3}
          placeholder="F.eks. høyde 45 cm, dybde 40 cm"
          style={{
            width: "100%",
            resize: "vertical",
          }}
        />
      </div>

      <div className="field">
        <label>
          Grunnpris i kroner
        </label>

        <input
          type="number"
          min="0"
          step="1"
          required
          value={price}
          onChange={(e) =>
            setPrice(
              e.target.value
            )
          }
          placeholder="2990"
        />
      </div>

      <div className="field">
        <label>
          Produktbilder
        </label>

        <p className="muted">
          Første bilde blir
          hovedbildet. Du kan laste
          opp flere bilder samtidig.
        </p>

        {imageUrls.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(150px, 1fr))",
              gap: 12,
              marginBottom: 14,
            }}
          >
            {imageUrls.map(
              (url, index) => (
                <div
                  key={`${url}-${index}`}
                  style={{
                    border:
                      "1px solid #ddd",
                    borderRadius: 12,
                    padding: 8,
                  }}
                >
                  <img
                    src={url}
                    alt={`Produktbilde ${
                      index + 1
                    }`}
                    style={{
                      width: "100%",
                      height: 130,
                      objectFit:
                        "cover",
                      borderRadius: 8,
                    }}
                  />

                  <small className="muted">
                    {index === 0
                      ? "Hovedbilde"
                      : `Bilde ${
                          index + 1
                        }`}
                  </small>

                  <div
                    style={{
                      display:
                        "flex",
                      gap: 6,
                      flexWrap:
                        "wrap",
                      marginTop: 8,
                    }}
                  >
                    <button
                      type="button"
                      className="btn alt"
                      onClick={() =>
                        moveImage(
                          index,
                          -1
                        )
                      }
                      disabled={
                        index === 0
                      }
                    >
                      ←
                    </button>

                    <button
                      type="button"
                      className="btn alt"
                      onClick={() =>
                        moveImage(
                          index,
                          1
                        )
                      }
                      disabled={
                        index ===
                        imageUrls.length -
                          1
                      }
                    >
                      →
                    </button>

                    <button
                      type="button"
                      className="btn alt"
                      onClick={() =>
                        setImageUrls(
                          (current) =>
                            current.filter(
                              (
                                _,
                                i
                              ) =>
                                i !==
                                index
                            )
                        )
                      }
                    >
                      Fjern
                    </button>
                  </div>
                </div>
              )
            )}
          </div>
        )}

        <input
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          disabled={uploading}
          onChange={(e) => {
            uploadImages(
              e.target.files
            );
            e.target.value = "";
          }}
        />

        {uploading && (
          <p className="muted">
            Laster opp bilde(r)...
          </p>
        )}
      </div>

      <div className="field">
        <label>
          Spesifikasjoner
        </label>

        <p className="muted">
          Eksempel: Materiale –
          impregnert tre, eller Maks
          belastning – 250 kg.
        </p>

        {specifications.map(
          (item, index) => (
            <div
              key={index}
              style={{
                display: "grid",
                gridTemplateColumns:
                  "1fr 1fr auto",
                gap: 8,
                marginBottom: 8,
              }}
            >
              <input
                value={
                  item.label || ""
                }
                onChange={(e) =>
                  updateSpecification(
                    index,
                    "label",
                    e.target.value
                  )
                }
                placeholder="Navn"
              />

              <input
                value={
                  item.value || ""
                }
                onChange={(e) =>
                  updateSpecification(
                    index,
                    "value",
                    e.target.value
                  )
                }
                placeholder="Verdi"
              />

              <button
                type="button"
                className="btn alt"
                onClick={() =>
                  removeSpecification(
                    index
                  )
                }
              >
                Fjern
              </button>
            </div>
          )
        )}

        <button
          type="button"
          className="btn alt"
          onClick={
            addSpecification
          }
        >
          + Legg til spesifikasjon
        </button>
      </div>

      <div className="field">
        <label>
          Varianter /
          rullegardinvalg
        </label>

        <p className="muted">
          Eksempel: Lengde med
          valgene 120 cm, 160 cm og
          200 cm. Pristillegg er
          valgfritt.
        </p>

        {options.map(
          (
            option,
            optionIndex
          ) => (
            <div
              key={
                option.id ||
                optionIndex
              }
              style={{
                border:
                  "1px solid #ddd",
                borderRadius: 12,
                padding: 14,
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems:
                    "end",
                  flexWrap:
                    "wrap",
                }}
              >
                <div
                  className="field"
                  style={{
                    flex:
                      "1 1 220px",
                    marginBottom: 0,
                  }}
                >
                  <label>
                    Navn på variant
                  </label>

                  <input
                    value={
                      option.label ||
                      ""
                    }
                    onChange={(
                      e
                    ) =>
                      updateOption(
                        optionIndex,
                        "label",
                        e.target
                          .value
                      )
                    }
                    placeholder="F.eks. Lengde"
                  />
                </div>

                <button
                  type="button"
                  className="btn alt"
                  onClick={() =>
                    removeOption(
                      optionIndex
                    )
                  }
                >
                  Fjern variant
                </button>
              </div>

              <div
                style={{
                  marginTop: 12,
                }}
              >
                {(
                  Array.isArray(
                    option.choices
                  )
                    ? option.choices
                    : []
                ).map(
                  (
                    choice,
                    choiceIndex
                  ) => (
                    <div
                      key={
                        choiceIndex
                      }
                      style={{
                        display:
                          "grid",
                        gridTemplateColumns:
                          "minmax(140px, 1fr) minmax(120px, 180px) auto",
                        gap: 8,
                        marginBottom: 8,
                      }}
                    >
                      <input
                        value={
                          choice.label ||
                          ""
                        }
                        onChange={(
                          e
                        ) =>
                          updateChoice(
                            optionIndex,
                            choiceIndex,
                            "label",
                            e
                              .target
                              .value
                          )
                        }
                        placeholder="F.eks. 160 cm"
                      />

                      <input
                        type="number"
                        step="1"
                        value={
                          choice.extraNok !==
                          undefined
                            ? choice.extraNok
                            : (Number(
                                choice.extraOre
                              ) ||
                                0) /
                              100
                        }
                        onChange={(
                          e
                        ) =>
                          updateChoice(
                            optionIndex,
                            choiceIndex,
                            "extraNok",
                            e
                              .target
                              .value
                          )
                        }
                        placeholder="Pristillegg kr"
                      />

                      <button
                        type="button"
                        className="btn alt"
                        onClick={() =>
                          removeChoice(
                            optionIndex,
                            choiceIndex
                          )
                        }
                      >
                        Fjern
                      </button>
                    </div>
                  )
                )}
              </div>

              <button
                type="button"
                className="btn alt"
                onClick={() =>
                  addChoice(
                    optionIndex
                  )
                }
              >
                + Legg til valg
              </button>
            </div>
          )
        )}

        <button
          type="button"
          className="btn alt"
          onClick={addOption}
        >
          + Legg til variant
        </button>
      </div>

      <label
        style={{
          display: "block",
          margin: "16px 0",
        }}
      >
        <input
          type="checkbox"
          checked={active}
          onChange={(e) =>
            setActive(
              e.target.checked
            )
          }
        />{" "}
        Vis produkt i
        nettbutikken
      </label>

      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <button
          className="btn"
          disabled={
            saving || uploading
          }
        >
          {saving
            ? "Lagrer..."
            : isNew
            ? "Opprett produkt"
            : "Lagre endringer"}
        </button>

        {!isNew && (
          <button
            type="button"
            className="btn alt"
            onClick={() => {
              resetFromProduct();
              setEditing(false);
            }}
          >
            Avbryt
          </button>
        )}

        {isNew && close && (
          <button
            type="button"
            className="btn alt"
            onClick={close}
          >
            Avbryt
          </button>
        )}
      </div>
    </form>
  );
}

function Categories({
  categories,
  products,
  reload,
  setError,
}) {
  const [showNew, setShowNew] = useState(false);

  return (
    <>
      <div style={{ marginBottom: 20 }}>
        <button
          className="btn"
          onClick={() => setShowNew(!showNew)}
        >
          {showNew ? "Avbryt" : "Legg til kategori"}
        </button>
      </div>

      {showNew && (
        <CategoryEditor
          category={null}
          products={products}
          reload={reload}
          setError={setError}
          close={() => setShowNew(false)}
        />
      )}

      {!categories.length && !showNew && (
        <div className="card">
          <h3>Ingen kategorier</h3>
          <p className="muted">
            Opprett den første kategorien for å organisere
            produktene.
          </p>
        </div>
      )}

      <div className="grid">
        {categories.map((category) => (
          <CategoryEditor
            key={category.id}
            category={category}
            products={products}
            reload={reload}
            setError={setError}
          />
        ))}
      </div>
    </>
  );
}

function CategoryEditor({
  category,
  products,
  reload,
  setError,
  close,
}) {
  const isNew = !category;

  const [editing, setEditing] = useState(isNew);
  const [name, setName] = useState(category?.name || "");
  const [description, setDescription] = useState(
    category?.description || ""
  );
  const [imageUrl, setImageUrl] = useState(
    category?.image_url || category?.imageUrl || ""
  );
  const [sortOrder, setSortOrder] = useState(
    String(
      category?.sort_order ??
        category?.sortOrder ??
        0
    )
  );
  const [active, setActive] = useState(
    category?.active !== false
  );

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function resetFromCategory() {
    if (!category) return;

    setName(category.name || "");
    setDescription(category.description || "");

    setImageUrl(
      category.image_url ||
        category.imageUrl ||
        ""
    );

    setSortOrder(
      String(
        category.sort_order ??
          category.sortOrder ??
          0
      )
    );

    setActive(category.active !== false);
  }

  useEffect(() => {
    resetFromCategory();
  }, [category]);

  async function uploadImage(file) {
    if (!file) return;

    setUploading(true);
    setError("");

    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(
      "/api/admin/upload",
      {
        method: "POST",
        body: formData,
      }
    );

    const data = await response
      .json()
      .catch(() => ({}));

    setUploading(false);

    if (!response.ok) {
      setError(
        data.error ||
          "Bildet kunne ikke lastes opp."
      );
      return;
    }

    if (data.url) {
      setImageUrl(data.url);
    }
  }

  async function save(e) {
    e?.preventDefault();

    setError("");

    if (!name.trim()) {
      setError(
        "Kategorien må ha et navn."
      );
      return;
    }

    const orderNumber =
      Number(sortOrder);

    if (
      !Number.isFinite(
        orderNumber
      )
    ) {
      setError(
        "Rekkefølge må være et tall."
      );
      return;
    }

    setSaving(true);

    const response = await fetch(
      "/api/admin/categories",
      {
        method: isNew
          ? "POST"
          : "PATCH",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          ...(isNew
            ? {}
            : {
                id: category.id,
              }),

          name:
            name.trim(),

          description:
            description.trim(),

          imageUrl:
            imageUrl || null,

          sortOrder:
            Math.round(
              orderNumber
            ),

          active,
        }),
      }
    );

    const data = await response
      .json()
      .catch(() => ({}));

    setSaving(false);

    if (!response.ok) {
      setError(
        data.error ||
          "Kategorien kunne ikke lagres."
      );
      return;
    }

    if (isNew && close) {
      close();
    } else {
      setEditing(false);
    }

    await reload();
  }

  async function toggleActive() {
    if (!category) return;

    setSaving(true);
    setError("");

    const response = await fetch(
      "/api/admin/categories",
      {
        method: "PATCH",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          id:
            category.id,

          name:
            category.name,

          description:
            category.description ||
            "",

          imageUrl:
            category.image_url ||
            category.imageUrl ||
            null,

          sortOrder:
            category.sort_order ??
            category.sortOrder ??
            0,

          active:
            category.active ===
            false,
        }),
      }
    );

    const data = await response
      .json()
      .catch(() => ({}));

    setSaving(false);

    if (!response.ok) {
      setError(
        data.error ||
          "Kategorien kunne ikke lagres."
      );
      return;
    }

    await reload();
  }

  async function removeCategory() {
    if (!category) return;

    const usedBy =
      products.filter(
        (product) =>
          product.categoryId ===
          category.id
      ).length;

    if (usedBy > 0) {
      setError(
        `Kategorien kan ikke slettes fordi ${usedBy} produkt${
          usedBy === 1 ? "" : "er"
        } ligger i kategorien. Flytt produktene først.`
      );
      return;
    }

    const confirmed =
      window.confirm(
        `Vil du slette kategorien "${category.name}"?`
      );

    if (!confirmed) return;

    setDeleting(true);
    setError("");

    const response = await fetch(
      "/api/admin/categories",
      {
        method: "DELETE",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          id: category.id,
        }),
      }
    );

    const data = await response
      .json()
      .catch(() => ({}));

    setDeleting(false);

    if (!response.ok) {
      setError(
        data.error ||
          "Kategorien kunne ikke slettes."
      );
      return;
    }

    await reload();
  }

  const usedBy = category
    ? products.filter(
        (product) =>
          product.categoryId ===
          category.id
      ).length
    : 0;

  if (!editing && category) {
    const previewImage =
      category.image_url ||
      category.imageUrl;

    return (
      <div className="card">
        {previewImage && (
          <img
            src={previewImage}
            alt={category.name}
            style={{
              width: "100%",
              height: 220,
              objectFit: "cover",
              borderRadius: 12,
              marginBottom: 16,
            }}
          />
        )}

        <div className="kicker">
          {category.active === false
            ? "Skjult kategori"
            : "Aktiv kategori"}
        </div>

        <h3>
          {category.name}
        </h3>

        {category.description && (
          <p>
            {category.description}
          </p>
        )}

        <p className="muted">
          Rekkefølge:{" "}
          {category.sort_order ??
            category.sortOrder ??
            0}
          {" · "}
          {usedBy} produkt
          {usedBy === 1
            ? ""
            : "er"}
        </p>

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            marginTop: 18,
          }}
        >
          <button
            className="btn"
            onClick={() =>
              setEditing(true)
            }
          >
            Rediger
          </button>

          <button
            className="btn alt"
            onClick={
              toggleActive
            }
            disabled={saving}
          >
            {category.active ===
            false
              ? "Vis kategori"
              : "Skjul kategori"}
          </button>

          <button
            className="btn alt"
            onClick={
              removeCategory
            }
            disabled={
              deleting ||
              usedBy > 0
            }
            title={
              usedBy > 0
                ? "Flytt produktene til en annen kategori før kategorien slettes."
                : ""
            }
          >
            {deleting
              ? "Sletter..."
              : "Slett"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="card"
      onSubmit={save}
      style={
        isNew
          ? {
              marginBottom: 20,
            }
          : undefined
      }
    >
      <div className="kicker">
        {isNew
          ? "Ny kategori"
          : "Rediger kategori"}
      </div>

      <h3>
        {isNew
          ? "Legg til kategori"
          : category.name}
      </h3>

      <div className="field">
        <label>
          Kategorinavn
        </label>

        <input
          required
          value={name}
          onChange={(e) =>
            setName(
              e.target.value
            )
          }
          placeholder="F.eks. Benker"
        />
      </div>

      <div className="field">
        <label>
          Beskrivelse
        </label>

        <textarea
          value={description}
          onChange={(e) =>
            setDescription(
              e.target.value
            )
          }
          rows={4}
          placeholder="Kort beskrivelse av kategorien"
          style={{
            width: "100%",
            resize: "vertical",
          }}
        />
      </div>

      <div className="field">
        <label>
          Kategoribilde
        </label>

        {imageUrl && (
          <div
            style={{
              marginBottom: 12,
            }}
          >
            <img
              src={imageUrl}
              alt="Kategoribilde"
              style={{
                width: "100%",
                maxWidth: 420,
                height: 220,
                objectFit: "cover",
                borderRadius: 12,
                display: "block",
                marginBottom: 10,
              }}
            />

            <button
              type="button"
              className="btn alt"
              onClick={() =>
                setImageUrl("")
              }
            >
              Fjern bilde
            </button>
          </div>
        )}

        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={uploading}
          onChange={(e) => {
            uploadImage(
              e.target.files?.[0]
            );

            e.target.value = "";
          }}
        />

        {uploading && (
          <p className="muted">
            Laster opp bilde...
          </p>
        )}
      </div>

      <div className="field">
        <label>
          Rekkefølge
        </label>

        <input
          type="number"
          step="1"
          value={sortOrder}
          onChange={(e) =>
            setSortOrder(
              e.target.value
            )
          }
        />

        <small className="muted">
          Laveste tall vises først.
        </small>
      </div>

      <label
        style={{
          display: "block",
          margin: "16px 0",
        }}
      >
        <input
          type="checkbox"
          checked={active}
          onChange={(e) =>
            setActive(
              e.target.checked
            )
          }
        />{" "}
        Vis kategori i
        nettbutikken
      </label>

      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <button
          className="btn"
          disabled={
            saving ||
            uploading
          }
        >
          {saving
            ? "Lagrer..."
            : isNew
            ? "Opprett kategori"
            : "Lagre endringer"}
        </button>

        {!isNew && (
          <button
            type="button"
            className="btn alt"
            onClick={() => {
              resetFromCategory();
              setEditing(false);
            }}
          >
            Avbryt
          </button>
        )}

        {isNew && close && (
          <button
            type="button"
            className="btn alt"
            onClick={close}
          >
            Avbryt
          </button>
        )}
      </div>
    </form>
  );
}

function Users({
  users,
  currentUserId,
  reload,
  setError,
  canEditUsers,
}) {
  const [showNew, setShowNew] =
    useState(false);

  return (
    <>
      {canEditUsers && (
        <div
          style={{
            marginBottom: 20,
          }}
        >
          <button
            className="btn"
            onClick={() =>
              setShowNew(
                !showNew
              )
            }
          >
            {showNew
              ? "Avbryt"
              : "Legg til bruker"}
          </button>
        </div>
      )}

      {canEditUsers &&
        showNew && (
          <NewUser
            reload={reload}
            setError={setError}
            close={() =>
              setShowNew(false)
            }
          />
        )}

      <div className="grid">
        {users.map(
          (adminUser) => (
            <UserCard
              key={
                adminUser.id
              }
              user={
                adminUser
              }
              currentUserId={
                currentUserId
              }
              reload={reload}
              setError={
                setError
              }
              canEdit={
                canEditUsers
              }
            />
          )
        )}
      </div>
    </>
  );
}

function NewUser({
  reload,
  setError,
  close,
}) {
  const [name, setName] =
    useState("");

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [
    permissions,
    setPermissions,
  ] = useState({
    canViewOrders: true,
    canUpdateOrders: false,
    canManageProducts: false,
    canManageUsers: false,
  });

  const [saving, setSaving] =
    useState(false);

  async function create(e) {
    e.preventDefault();

    setSaving(true);
    setError("");

    const response = await fetch(
      "/api/admin/users",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          name,
          email,
          password,
          ...permissions,
        }),
      }
    );

    const data = await response
      .json()
      .catch(() => ({}));

    setSaving(false);

    if (!response.ok) {
      setError(
        data.error ||
          "Brukeren kunne ikke opprettes."
      );
      return;
    }

    close();
    await reload();
  }

  return (
    <form
      className="card"
      onSubmit={create}
      autoComplete="off"
      style={{
        marginBottom: 20,
      }}
    >
      <h3>Ny bruker</h3>

      <div className="field">
        <label>Navn</label>

        <input
          name="new-admin-name"
          autoComplete="off"
          required
          value={name}
          onChange={(e) =>
            setName(
              e.target.value
            )
          }
        />
      </div>

      <div className="field">
        <label>E-post</label>

        <input
          type="email"
          name="new-admin-email"
          autoComplete="off"
          required
          value={email}
          onChange={(e) =>
            setEmail(
              e.target.value
            )
          }
        />
      </div>

      <div className="field">
        <label>
          Midlertidig passord
        </label>

        <input
          type="password"
          name="new-admin-password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) =>
            setPassword(
              e.target.value
            )
          }
        />
      </div>

      <PermissionChecks
        values={permissions}
        setValues={
          setPermissions
        }
      />

      <button
        className="btn"
        disabled={saving}
      >
        {saving
          ? "Oppretter..."
          : "Opprett bruker"}
      </button>
    </form>
  );
}

function UserCard({
  user,
  currentUserId,
  reload,
  setError,
  canEdit,
}) {
  const owner =
    user.role === "owner";

  const [values, setValues] =
    useState({
      name: user.name || "",

      canViewOrders:
        Boolean(
          user.can_view_orders
        ),

      canUpdateOrders:
        Boolean(
          user.can_update_orders
        ),

      canManageProducts:
        Boolean(
          user.can_manage_products
        ),

      canManageUsers:
        Boolean(
          user.can_manage_users
        ),

      active:
        user.active !== false,
    });

  const [saving, setSaving] =
    useState(false);

  async function save() {
    if (!canEdit || owner) {
      return;
    }

    setSaving(true);
    setError("");

    const response = await fetch(
      "/api/admin/users",
      {
        method: "PATCH",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          id: user.id,
          ...values,
        }),
      }
    );

    const data = await response
      .json()
      .catch(() => ({}));

    setSaving(false);

    if (!response.ok) {
      setError(
        data.error ||
          "Brukeren kunne ikke oppdateres."
      );
      return;
    }

    await reload();
  }

  return (
    <div className="card">
      <div className="kicker">
        {owner
          ? "Eier"
          : "Bruker"}
      </div>

      <h3>{user.name}</h3>

      <p className="muted">
        {user.email}
      </p>

      {canEdit && !owner ? (
        <>
          <div className="field">
            <label>Navn</label>

            <input
              value={
                values.name
              }
              onChange={(e) =>
                setValues({
                  ...values,
                  name:
                    e.target
                      .value,
                })
              }
            />
          </div>

          <PermissionChecks
            values={values}
            setValues={
              setValues
            }
          />

          <label
            style={{
              display: "block",
              marginBottom: 14,
            }}
          >
            <input
              type="checkbox"
              checked={
                values.active
              }
              onChange={(e) =>
                setValues({
                  ...values,
                  active:
                    e.target
                      .checked,
                })
              }
              disabled={
                user.id ===
                currentUserId
              }
            />{" "}
            Aktiv bruker
          </label>

          <button
            className="btn alt"
            onClick={save}
            disabled={saving}
          >
            {saving
              ? "Lagrer..."
              : "Lagre endringer"}
          </button>
        </>
      ) : (
        <>
          <p>
            <b>Navn:</b>{" "}
            {user.name}
          </p>

          <PermissionChecks
            values={values}
            setValues={
              setValues
            }
            disabled
          />

          {!owner && (
            <p className="muted">
              {values.active
                ? "Aktiv bruker"
                : "Deaktivert bruker"}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function PermissionChecks({
  values,
  setValues,
  disabled = false,
}) {
  const permissions = [
    [
      "canViewOrders",
      "Se bestillinger",
    ],
    [
      "canUpdateOrders",
      "Endre bestillinger",
    ],
    [
      "canManageProducts",
      "Administrere produkter",
    ],
    [
      "canManageUsers",
      "Administrere brukere",
    ],
  ];

  return (
    <div
      style={{
        margin: "16px 0",
      }}
    >
      {permissions.map(
        ([key, label]) => (
          <label
            key={key}
            style={{
              display: "block",
              marginBottom: 8,
            }}
          >
            <input
              type="checkbox"
              checked={Boolean(
                values[key]
              )}
              disabled={disabled}
              onChange={(e) =>
                setValues({
                  ...values,
                  [key]:
                    e.target
                      .checked,
                })
              }
            />{" "}
            {label}
          </label>
        )
      )}
    </div>
  );
}


function Services({ services, reload, setError }) {
  const [showNew, setShowNew] = useState(false);
  return <>
    <div style={{marginBottom:20}}><button className="btn" onClick={()=>setShowNew(!showNew)}>{showNew?"Avbryt":"Legg til tjeneste"}</button></div>
    {showNew && <ServiceEditor service={null} reload={reload} setError={setError} close={()=>setShowNew(false)} />}
    <div className="grid">{services.map(service=><ServiceEditor key={service.id} service={service} reload={reload} setError={setError} />)}</div>
  </>;
}

function ServiceEditor({ service, reload, setError, close }) {
  const isNew=!service;
  const [editing,setEditing]=useState(isNew);
  const [title,setTitle]=useState(service?.title||"");
  const [description,setDescription]=useState(service?.description||"");
  const [active,setActive]=useState(service?.active!==false);
  const [showOnHome,setShowOnHome]=useState(service?.showOnHome!==false);
  const [showInMenu,setShowInMenu]=useState(service?.showInMenu!==false);
  const [showInFooter,setShowInFooter]=useState(service?.showInFooter!==false);
  const [hasPage,setHasPage]=useState(service?.hasPage===true);
  const [ctaLabel,setCtaLabel]=useState(service?.ctaLabel||"Les mer");
  const [formTitle,setFormTitle]=useState(service?.formTitle||"Be om befaring");
  const [formPrompt,setFormPrompt]=useState(service?.formPrompt||"Beskriv kort hva du ønsker hjelp med.");
  const [deleting,setDeleting]=useState(false);
  const [kind,setKind]=useState(service?.kind||"service");
  const [sortOrder,setSortOrder]=useState(service?.sortOrder??0);
  const [imageUrl,setImageUrl]=useState(service?.imageUrl||"");
  const [uploading,setUploading]=useState(false);
  const [publishFrom,setPublishFrom]=useState(service?.publishFrom?String(service.publishFrom).slice(0,10):"");
  const [publishUntil,setPublishUntil]=useState(service?.publishUntil?String(service.publishUntil).slice(0,10):"");
  const [saving,setSaving]=useState(false);

  async function uploadImage(file){
    if(!file)return; setUploading(true); setError("");
    const formData=new FormData(); formData.append("file",file);
    const response=await fetch("/api/admin/upload",{method:"POST",body:formData});
    const data=await response.json().catch(()=>({})); setUploading(false);
    if(!response.ok){setError(data.error||"Bildet kunne ikke lastes opp.");return;}
    if(data.url)setImageUrl(data.url);
  }

  async function save(e){
    e?.preventDefault(); setError("");
    if(!title.trim()){setError("Tjenesten må ha et navn.");return;}
    setSaving(true);
    const response=await fetch("/api/admin/services",{method:isNew?"POST":"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      ...(isNew?{}:{id:service.id}),title:title.trim(),description:description.trim(),active,showOnHome,showInMenu,showInFooter,sortOrder,
      kind,imageUrl,hasPage,ctaLabel,
      ctaHref:service?.ctaHref||"",formTitle,formPrompt,
      publishFrom:publishFrom?publishFrom+"T00:00:00":null,publishUntil:publishUntil?publishUntil+"T23:59:59":null
    })});
    const data=await response.json().catch(()=>({})); setSaving(false);
    if(!response.ok){setError(data.error||"Tjenesten kunne ikke lagres.");return;}
    if(isNew&&close)close(); else setEditing(false);
    await reload();
  }

  async function removeService(){
    if(!service?.id)return;
    if(!window.confirm(`Slette tjenesten "${service.title}"? Dette kan ikke angres.`))return;
    setDeleting(true); setError("");
    const response=await fetch("/api/admin/services",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:service.id})});
    const data=await response.json().catch(()=>({})); setDeleting(false);
    if(!response.ok){setError(data.error||"Tjenesten kunne ikke slettes.");return;}
    await reload();
  }

  if(!editing&&service)return <div className="card"><div className="kicker">{service.active===false?"Skjult":"Publisert"}</div><h3>{service.title}</h3><p>{service.description}</p><p className="muted">{service.showOnHome?"Forside · ":""}{service.showInMenu?"Meny · ":""}{service.showInFooter?"Footer":""}</p><div style={{display:"flex",gap:10,flexWrap:"wrap"}}><button className="btn" onClick={()=>setEditing(true)}>Rediger</button><button className="btn alt" onClick={removeService} disabled={deleting}>{deleting?"Sletter …":"Slett"}</button></div></div>;

  return <form className="card" onSubmit={save}>
    <div className="kicker">{isNew?"Ny tjeneste":"Rediger tjeneste"}</div>
    <h3>{isNew?"Legg til tjeneste":service.title}</h3>
    <div className="field"><label>Navn</label><input required value={title} onChange={e=>setTitle(e.target.value)} placeholder="F.eks. Brøyting" /></div>
    <div className="field"><label>Beskrivelse</label><textarea rows="4" value={description} onChange={e=>setDescription(e.target.value)} /></div>\n    <div className="field"><label>Type</label><select value={kind} onChange={e=>setKind(e.target.value)}><option value="service">Vanlig tjeneste</option><option value="rental">Utleie</option><option value="products">Produkter på bestilling</option><option value="survey">Befaring</option></select></div>
    <div className="field"><label>Bilde</label>{imageUrl&&<img src={imageUrl} alt="" style={{width:"100%",height:180,objectFit:"cover",borderRadius:12,marginBottom:10}}/>}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={e=>uploadImage(e.target.files?.[0])}/>{uploading&&<small className="muted">Laster opp …</small>}</div>\n    <div className="field"><label>Rekkefølge</label><input type="number" value={sortOrder} onChange={e=>setSortOrder(e.target.value)} /></div>\n    <div className="field"><label>Publiser fra (valgfritt)</label><input type="date" value={publishFrom} onChange={e=>setPublishFrom(e.target.value)} /></div>\n    <div className="field"><label>Publiser til (valgfritt)</label><input type="date" value={publishUntil} onChange={e=>setPublishUntil(e.target.value)} /></div>
    <label><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)} /> Publisert</label><br/>
    <label><input type="checkbox" checked={showOnHome} onChange={e=>setShowOnHome(e.target.checked)} /> Vis på forsiden</label><br/>
    <label><input type="checkbox" checked={showInMenu} onChange={e=>setShowInMenu(e.target.checked)} /> Vis i meny</label><br/>
    <label><input type="checkbox" checked={showInFooter} onChange={e=>setShowInFooter(e.target.checked)} /> Vis i footer</label><br/>\n    <label><input type="checkbox" checked={hasPage} onChange={e=>setHasPage(e.target.checked)} /> Egen tjenesteside</label>\n    <div className="field" style={{marginTop:16}}><label>Tekst på knapp</label><input value={ctaLabel} onChange={e=>setCtaLabel(e.target.value)} placeholder="Les mer" /></div>\n    <div className="field"><label>Overskrift i forespørsel</label><input value={formTitle} onChange={e=>setFormTitle(e.target.value)} /></div>\n    <div className="field"><label>Hjelpetekst i forespørsel</label><textarea rows="3" value={formPrompt} onChange={e=>setFormPrompt(e.target.value)} /></div>
    <div style={{display:"flex",gap:10,marginTop:18}}><button className="btn" disabled={saving}>{saving?"Lagrer …":"Lagre"}</button>{!isNew&&<button type="button" className="btn alt" onClick={()=>setEditing(false)}>Avbryt</button>}</div>
  </form>;
}
