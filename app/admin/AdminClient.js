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
  const [users, setUsers] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(
    user?.id || ""
  );
  const [error, setError] = useState("");

  const router = useRouter();

  const canViewOrders =
    user?.role === "owner" ||
    Boolean(user?.canViewOrders);

  const canUpdateOrders =
    user?.role === "owner" ||
    Boolean(user?.canUpdateOrders);

  const canManageProducts =
    user?.role === "owner" ||
    Boolean(user?.canManageProducts);

  const canManageUsers =
    user?.role === "owner" ||
    Boolean(user?.canManageUsers);

  const canEditUsers = user?.role === "owner";

  async function load() {
    setError("");

    if (canViewOrders) {
      const orderResponse = await fetch(
        "/api/admin/orders"
      );

      if (orderResponse.status === 401) {
        router.replace("/admin/login");
        return;
      }

      if (orderResponse.ok) {
        const data = await orderResponse.json();
        setOrders(data.orders || []);
      } else {
        const data = await orderResponse
          .json()
          .catch(() => ({}));

        setError(
          data.error ||
            "Bestillingene kunne ikke hentes."
        );

        setOrders([]);
      }
    } else {
      setOrders([]);
    }

    if (canManageProducts) {
      const productResponse = await fetch(
        "/api/admin/products"
      );

      if (productResponse.status === 401) {
        router.replace("/admin/login");
        return;
      }

      if (productResponse.ok) {
        const data = await productResponse.json();
        setProducts(data.products || []);
      } else {
        const data = await productResponse
          .json()
          .catch(() => ({}));

        setError(
          data.error ||
            "Produktene kunne ikke hentes."
        );

        setProducts([]);
      }
    } else {
      setProducts([]);
    }

    if (canManageUsers) {
      const userResponse = await fetch(
        "/api/admin/users"
      );

      if (userResponse.status === 401) {
        router.replace("/admin/login");
        return;
      }

      if (userResponse.ok) {
        const data = await userResponse.json();

        setUsers(data.users || []);

        setCurrentUserId(
          data.currentUserId || user?.id || ""
        );
      } else {
        const data = await userResponse
          .json()
          .catch(() => ({}));

        setError(
          data.error ||
            "Brukerne kunne ikke hentes."
        );

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
      setError(
        "Du har ikke tilgang til å endre bestillinger."
      );
      return;
    }

    setError("");

    const response = await fetch(
      "/api/admin/orders",
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id,
          status: newStatus,
        }),
      }
    );

    const data = await response
      .json()
      .catch(() => ({}));

    if (!response.ok) {
      setError(
        data.error ||
          "Status kunne ikke lagres."
      );
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
    [
      "confirmed",
      "in_progress",
      "ready",
    ].includes(order.status)
  ).length;

  const total = orders.reduce(
    (sum, order) =>
      sum + (order.totalOre || 0),
    0
  );

  const tabs = [["overview", "Oversikt"]];

  if (canViewOrders) {
    tabs.push(["orders", "Bestillinger"]);
  }

  if (canManageProducts) {
    tabs.push(["products", "Produkter"]);
  }

  if (canManageUsers) {
    tabs.push(["users", "Brukere"]);
  }

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
            className={
              tab === id ? "active" : ""
            }
            onClick={() => setTab(id)}
          >
            {label}
            {id === "orders" && fresh
              ? ` (${fresh})`
              : ""}
          </button>
        ))}

        <button onClick={logout}>
          Logg ut
        </button>
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
            : "Brukere"}
        </h1>

        {error && (
          <p className="notice">{error}</p>
        )}

        {tab === "overview" && (
          <>
            <div className="stats">
              {canViewOrders && (
                <>
                  <div className="stat">
                    <span className="muted">
                      Nye ordre
                    </span>
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
                <div className="stat">
                  <span className="muted">
                    Aktive produkter
                  </span>
                  <br />
                  <b>
                    {
                      products.filter(
                        (product) =>
                          product.active !==
                          false
                      ).length
                    }
                  </b>
                </div>
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
                canUpdateOrders={
                  canUpdateOrders
                }
              />
            )}

            {!canViewOrders && (
              <div className="card">
                <h3>Velkommen</h3>
                <p className="muted">
                  Du er logget inn i Aadland
                  Service backoffice. Menyen
                  viser funksjonene du har fått
                  tilgang til.
                </p>
              </div>
            )}
          </>
        )}

        {tab === "orders" &&
          canViewOrders && (
            <Orders
              orders={orders}
              status={status}
              canUpdateOrders={
                canUpdateOrders
              }
            />
          )}

        {tab === "products" &&
          canManageProducts && (
            <Products
              products={products}
              reload={load}
              setError={setError}
            />
          )}

        {tab === "users" &&
          canManageUsers && (
            <Users
              users={users}
              currentUserId={
                currentUserId
              }
              reload={load}
              setError={setError}
              canEditUsers={
                canEditUsers
              }
            />
          )}
      </section>
    </main>
  );
}

function Orders({
  orders,
  status,
  canUpdateOrders,
}) {
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
                {new Date(
                  order.createdAt
                ).toLocaleString("nb-NO")}
              </small>
            </td>

            <td>
              {order.customerName}
              <br />
              <small>
                {order.customerEmail}
              </small>
            </td>

            <td>
              {order.orderType === "custom"
                ? "Forespørsel"
                : "Produkt"}
            </td>

            <td>
              {order.fulfillmentType ===
              "delivery"
                ? "Levering"
                : "Henting"}
            </td>

            <td>
              {nok(order.totalOre || 0)}
            </td>

            <td>
              {canUpdateOrders ? (
                <select
                  value={order.status}
                  onChange={(e) =>
                    status(
                      order.id,
                      e.target.value
                    )
                  }
                >
                  {Object.entries(
                    labels
                  ).map(
                    ([value, label]) => (
                      <option
                        value={value}
                        key={value}
                      >
                        {label}
                      </option>
                    )
                  )}
                </select>
              ) : (
                <span>
                  {labels[order.status] ||
                    order.status}
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
  reload,
  setError,
}) {
  const [showNew, setShowNew] =
    useState(false);

  return (
    <>
      <div
        style={{
          marginBottom: 20,
        }}
      >
        <button
          className="btn"
          onClick={() =>
            setShowNew(!showNew)
          }
        >
          {showNew
            ? "Avbryt"
            : "Legg til produkt"}
        </button>
      </div>

      {showNew && (
        <ProductEditor
          product={null}
          reload={reload}
          setError={setError}
          close={() =>
            setShowNew(false)
          }
        />
      )}

      <div className="grid">
        {products.map((product) => (
          <ProductEditor
            key={product.id}
            product={product}
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
  reload,
  setError,
  close,
}) {
  const isNew = !product;

  const [editing, setEditing] =
    useState(isNew);

  const [name, setName] = useState(
    product?.name || ""
  );

  const [category, setCategory] =
    useState(
      product?.category ||
        "På bestilling"
    );

  const [description, setDescription] =
    useState(
      product?.description || ""
    );

  const [price, setPrice] = useState(
    product
      ? String(
          (Number(
            product.basePriceOre
          ) || 0) / 100
        )
      : ""
  );

  const [imageUrl, setImageUrl] =
    useState(
      product?.imageUrl || ""
    );

  const [active, setActive] =
    useState(
      product?.active !== false
    );

  const [saving, setSaving] =
    useState(false);

  const [uploading, setUploading] =
    useState(false);

  useEffect(() => {
    if (!product) return;

    setName(product.name || "");
    setCategory(
      product.category ||
        "På bestilling"
    );
    setDescription(
      product.description || ""
    );
    setPrice(
      String(
        (Number(
          product.basePriceOre
        ) || 0) / 100
      )
    );
    setImageUrl(
      product.imageUrl || ""
    );
    setActive(
      product.active !== false
    );
  }, [product]);

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

    setImageUrl(data.url || "");
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
            : { id: product.id }),
          name: name.trim(),
          category:
            category.trim() ||
            "På bestilling",
          description:
            description.trim(),
          basePriceOre: Math.round(
            priceNumber * 100
          ),
          imageUrl:
            imageUrl || null,
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
          category:
            product.category ||
            "På bestilling",
          description:
            product.description ||
            "",
          basePriceOre:
            Number(
              product.basePriceOre
            ) || 0,
          imageUrl:
            product.imageUrl ||
            null,
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
    return (
      <div className="card">
        {product.imageUrl && (
          <img
            src={product.imageUrl}
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

        <b>
          {nok(
            product.basePriceOre
          )}
        </b>

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
            {product.active === false
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
          ? { marginBottom: 20 }
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
            setName(e.target.value)
          }
          placeholder="F.eks. Spilebenk"
        />
      </div>

      <div className="field">
        <label>Kategori</label>

        <input
          value={category}
          onChange={(e) =>
            setCategory(
              e.target.value
            )
          }
          placeholder="F.eks. Benker"
        />
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
        <label>Pris i kroner</label>

        <input
          type="number"
          min="0"
          step="1"
          required
          value={price}
          onChange={(e) =>
            setPrice(e.target.value)
          }
          placeholder="2990"
        />
      </div>

      <div className="field">
        <label>Produktbilde</label>

        {imageUrl && (
          <div
            style={{
              marginBottom: 12,
            }}
          >
            <img
              src={imageUrl}
              alt="Produktbilde"
              style={{
                width: "100%",
                maxHeight: 280,
                objectFit: "cover",
                borderRadius: 12,
              }}
            />

            <button
              type="button"
              className="btn alt"
              onClick={() =>
                setImageUrl("")
              }
              style={{
                marginTop: 10,
              }}
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
            const file =
              e.target.files?.[0];

            if (file) {
              uploadImage(file);
            }

            e.target.value = "";
          }}
        />

        {uploading && (
          <p className="muted">
            Laster opp bilde...
          </p>
        )}
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
        Vis produkt i nettbutikken
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
              setEditing(false);
              setName(
                product.name || ""
              );
              setCategory(
                product.category ||
                  "På bestilling"
              );
              setDescription(
                product.description ||
                  ""
              );
              setPrice(
                String(
                  (Number(
                    product.basePriceOre
                  ) || 0) / 100
                )
              );
              setImageUrl(
                product.imageUrl || ""
              );
              setActive(
                product.active !== false
              );
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
              setShowNew(!showNew)
            }
          >
            {showNew
              ? "Avbryt"
              : "Legg til bruker"}
          </button>
        </div>
      )}

      {canEditUsers && showNew && (
        <NewUser
          reload={reload}
          setError={setError}
          close={() =>
            setShowNew(false)
          }
        />
      )}

      <div className="grid">
        {users.map((adminUser) => (
          <UserCard
            key={adminUser.id}
            user={adminUser}
            currentUserId={
              currentUserId
            }
            reload={reload}
            setError={setError}
            canEdit={canEditUsers}
          />
        ))}
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
            setName(e.target.value)
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
            setEmail(e.target.value)
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
        setValues={setPermissions}
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
      canViewOrders: Boolean(
        user.can_view_orders
      ),
      canUpdateOrders: Boolean(
        user.can_update_orders
      ),
      canManageProducts: Boolean(
        user.can_manage_products
      ),
      canManageUsers: Boolean(
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
        {owner ? "Eier" : "Bruker"}
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
              value={values.name}
              onChange={(e) =>
                setValues({
                  ...values,
                  name: e.target.value,
                })
              }
            />
          </div>

          <PermissionChecks
            values={values}
            setValues={setValues}
          />

          <label
            style={{
              display: "block",
              marginBottom: 14,
            }}
          >
            <input
              type="checkbox"
              checked={values.active}
              onChange={(e) =>
                setValues({
                  ...values,
                  active:
                    e.target.checked,
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
            setValues={setValues}
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
                    e.target.checked,
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
