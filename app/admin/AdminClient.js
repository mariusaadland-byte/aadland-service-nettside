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

export default function AdminClient() {
  const [tab, setTab] = useState("overview");
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [users, setUsers] = useState([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [canManageUsers, setCanManageUsers] = useState(false);
  const [error, setError] = useState("");

  const router = useRouter();

  async function load() {
    setError("");

    const [a, b] = await Promise.all([
      fetch("/api/admin/orders"),
      fetch("/api/admin/products"),
    ]);

    if (a.status === 401 || b.status === 401) {
      router.replace("/admin/login");
      return;
    }

    const x = await a.json();
    const y = await b.json();

    setOrders(x.orders || []);
    setProducts(y.products || []);

    const u = await fetch("/api/admin/users");

    if (u.status === 200) {
      const z = await u.json();
      setUsers(z.users || []);
      setCurrentUserId(z.currentUserId || "");
      setCanManageUsers(true);
    } else if (u.status === 401) {
      router.replace("/admin/login");
    } else {
      setCanManageUsers(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function status(id, status) {
    await fetch("/api/admin/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });

    load();
  }

  async function toggle(p) {
    await fetch("/api/admin/products", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...p,
        active: p.active === false,
      }),
    });

    load();
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/admin/login");
  }

  const fresh = orders.filter((o) => o.status === "new").length;

  const working = orders.filter((o) =>
    ["confirmed", "in_progress", "ready"].includes(o.status)
  ).length;

  const total = orders.reduce((s, o) => s + (o.totalOre || 0), 0);

  const tabs = [
    ["overview", "Oversikt"],
    ["orders", "Bestillinger"],
    ["products", "Produkter"],
  ];

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
        <div className="kicker">Aadland Service / Back office</div>

        <h1>
          {tab === "overview"
            ? "Oversikt"
            : tab === "orders"
            ? "Bestillinger"
            : tab === "products"
            ? "Produkter"
            : "Brukere"}
        </h1>

        {error && <p className="notice">{error}</p>}

        {tab === "overview" && (
          <>
            <div className="stats">
              <div className="stat">
                <span className="muted">Nye ordre</span>
                <br />
                <b>{fresh}</b>
              </div>

              <div className="stat">
                <span className="muted">Under behandling</span>
                <br />
                <b>{working}</b>
              </div>

              <div className="stat">
                <span className="muted">Aktive produkter</span>
                <br />
                <b>{products.filter((p) => p.active !== false).length}</b>
              </div>

              <div className="stat">
                <span className="muted">Ordreverdi</span>
                <br />
                <b>{nok(total)}</b>
              </div>
            </div>

            <Orders orders={orders.slice(0, 5)} status={status} />
          </>
        )}

        {tab === "orders" && (
          <Orders orders={orders} status={status} />
        )}

        {tab === "products" && (
          <Products products={products} toggle={toggle} />
        )}

        {tab === "users" && canManageUsers && (
          <Users
            users={users}
            currentUserId={currentUserId}
            reload={load}
            setError={setError}
          />
        )}
      </section>
    </main>
  );
}

function Orders({ orders, status }) {
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
        {orders.map((o) => (
          <tr key={o.id}>
            <td>
              <b>{o.orderNumber}</b>
              <br />
              <small>
                {new Date(o.createdAt).toLocaleString("nb-NO")}
              </small>
            </td>

            <td>
              {o.customerName}
              <br />
              <small>{o.customerEmail}</small>
            </td>

            <td>
              {o.orderType === "custom" ? "Forespørsel" : "Produkt"}
            </td>

            <td>
              {o.fulfillmentType === "delivery"
                ? "Levering"
                : "Henting"}
            </td>

            <td>{nok(o.totalOre || 0)}</td>

            <td>
              <select
                value={o.status}
                onChange={(e) => status(o.id, e.target.value)}
              >
                {Object.entries(labels).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Products({ products, toggle }) {
  return (
    <div className="grid">
      {products.map((p) => (
        <div className="card" key={p.id}>
          <div className="kicker">{p.category}</div>
          <h3>{p.name}</h3>
          <p>{p.description}</p>
          <b>{nok(p.basePriceOre)}</b>

          <p>
            <button
              className="btn alt"
              onClick={() => toggle(p)}
            >
              {p.active === false
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
}) {
  const [showNew, setShowNew] = useState(false);

  return (
    <>
      <div style={{ marginBottom: 20 }}>
        <button
          className="btn"
          onClick={() => setShowNew(!showNew)}
        >
          {showNew ? "Avbryt" : "Legg til bruker"}
        </button>
      </div>

      {showNew && (
        <NewUser
          reload={reload}
          setError={setError}
          close={() => setShowNew(false)}
        />
      )}

      <div className="grid">
        {users.map((user) => (
          <UserCard
            key={user.id}
            user={user}
            currentUserId={currentUserId}
            reload={reload}
            setError={setError}
          />
        ))}
      </div>
    </>
  );
}

function NewUser({ reload, setError, close }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [permissions, setPermissions] = useState({
    canViewOrders: true,
    canUpdateOrders: false,
    canManageProducts: false,
    canManageUsers: false,
  });

  const [saving, setSaving] = useState(false);

  async function create(e) {
    e.preventDefault();

    setSaving(true);
    setError("");

    const r = await fetch("/api/admin/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        email,
        password,
        ...permissions,
      }),
    });

    const data = await r.json();

    setSaving(false);

    if (!r.ok) {
      setError(data.error || "Brukeren kunne ikke opprettes.");
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
      style={{ marginBottom: 20 }}
    >
      <h3>Ny bruker</h3>

      <div className="field">
        <label>Navn</label>
        <input
          name="new-admin-name"
          autoComplete="off"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
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
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="field">
        <label>Midlertidig passord</label>
        <input
          type="password"
          name="new-admin-password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <PermissionChecks
        values={permissions}
        setValues={setPermissions}
      />

      <button className="btn" disabled={saving}>
        {saving ? "Oppretter..." : "Opprett bruker"}
      </button>
    </form>
  );
}

function UserCard({
  user,
  currentUserId,
  reload,
  setError,
}) {
  const owner = user.role === "owner";

  const [values, setValues] = useState({
    name: user.name || "",
    canViewOrders: Boolean(user.can_view_orders),
    canUpdateOrders: Boolean(user.can_update_orders),
    canManageProducts: Boolean(user.can_manage_products),
    canManageUsers: Boolean(user.can_manage_users),
    active: user.active !== false,
  });

  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError("");

    const r = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: user.id,
        ...values,
      }),
    });

    const data = await r.json();

    setSaving(false);

    if (!r.ok) {
      setError(data.error || "Brukeren kunne ikke oppdateres.");
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
      <p className="muted">{user.email}</p>

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
        disabled={owner}
      />

      {!owner && (
        <label style={{ display: "block", marginBottom: 14 }}>
          <input
            type="checkbox"
            checked={values.active}
            onChange={(e) =>
              setValues({
                ...values,
                active: e.target.checked,
              })
            }
            disabled={user.id === currentUserId}
          />{" "}
          Aktiv bruker
        </label>
      )}

      <button
        className="btn alt"
        onClick={save}
        disabled={saving}
      >
        {saving ? "Lagrer..." : "Lagre endringer"}
      </button>
    </div>
  );
}

function PermissionChecks({
  values,
  setValues,
  disabled = false,
}) {
  const permissions = [
    ["canViewOrders", "Se bestillinger"],
    ["canUpdateOrders", "Endre bestillinger"],
    ["canManageProducts", "Administrere produkter"],
    ["canManageUsers", "Administrere brukere"],
  ];

  return (
    <div style={{ margin: "16px 0" }}>
      {permissions.map(([key, label]) => (
        <label
          key={key}
          style={{
            display: "block",
            marginBottom: 8,
          }}
        >
          <input
            type="checkbox"
            checked={Boolean(values[key])}
            disabled={disabled}
            onChange={(e) =>
              setValues({
                ...values,
                [key]: e.target.checked,
              })
            }
          />{" "}
          {label}
        </label>
      ))}
    </div>
  );
}
