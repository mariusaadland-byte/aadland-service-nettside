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

  async function toggle(product) {
    if (!canManageProducts) {
      setError(
        "Du har ikke tilgang til å administrere produkter."
      );
      return;
    }

    setError("");

    const response = await fetch(
      "/api/admin/products",
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...product,
          active: product.active === false,
        }),
      }
    );

    const data = await response
      .json()
      .catch(() => ({}));

    if (!response.ok) {
      setError(
        data.error ||
          "Produktet kunne ikke lagres."
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
              toggle={toggle}
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
  toggle,
}) {
  return (
    <div className="grid">
      {products.map((product) => (
        <div
          className="card"
          key={product.id}
        >
          <div className="kicker">
            {product.category}
          </div>

          <h3>{product.name}</h3>

          <p>{product.description}</p>

          <b>
            {nok(product.basePriceOre)}
          </b>

          <p>
            <button
              className="btn alt"
              onClick={() =>
                toggle(product)
              }
            >
              {product.active === false
                ? "Vis produkt"
                : "Skjul produkt"}
            </button>
          </p>
        </div>
      ))}
    </div>
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
