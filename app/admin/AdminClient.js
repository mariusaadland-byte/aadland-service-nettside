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
  const [menuOpen, setMenuOpen] = useState(false);
  const [orders, setOrders] = useState([]);
  const [customerProfiles, setCustomerProfiles] = useState([]);
  const [customerQuotes, setCustomerQuotes] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [services, setServices] = useState([]);
  const [rentalItems, setRentalItems] = useState([]);
  const [rentalCategories, setRentalCategories] = useState([]);
  const [rentalCategorySetupRequired, setRentalCategorySetupRequired] = useState(false);
  const [rentalBookings, setRentalBookings] = useState([]);
  const [rentalBlocks, setRentalBlocks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [projectStorySetupRequired, setProjectStorySetupRequired] = useState(false);
  const [users, setUsers] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(user?.id || "");
  const [error, setError] = useState("");
  const [siteSettings, setSiteSettings] = useState(null);

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

    if (canViewOrders) {
      const response = await fetch("/api/admin/customers");
      if (response.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (response.ok) {
        const data = await response.json();
        setCustomerProfiles(data.customers || []);
        setCustomerQuotes(data.quotes || []);
      } else {
        setCustomerProfiles([]);
        setCustomerQuotes([]);
      }
    } else {
      setCustomerProfiles([]);
      setCustomerQuotes([]);
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

    if (canManageProducts) {
      const [itemsResponse, blocksResponse, rentalCategoriesResponse] = await Promise.all([
        fetch("/api/admin/rental"),
        fetch("/api/admin/rental/blocks"),
        fetch("/api/admin/rental/categories"),
      ]);
      if (itemsResponse.ok) {
        const data = await itemsResponse.json();
        setRentalItems(data.items || []);
      } else {
        setRentalItems([]);
      }
      if (blocksResponse.ok) {
        const data = await blocksResponse.json();
        setRentalBlocks(data.blocks || []);
      } else {
        setRentalBlocks([]);
      }
      if (rentalCategoriesResponse.ok) {
        const data = await rentalCategoriesResponse.json();
        setRentalCategories(data.categories || []);
        setRentalCategorySetupRequired(data.setupRequired===true);
      } else {
        const data = await rentalCategoriesResponse.json().catch(() => ({}));
        setRentalCategories([]);
        setRentalCategorySetupRequired(data.setupRequired===true);
      }
    } else {
      setRentalItems([]);
      setRentalCategories([]);
      setRentalCategorySetupRequired(false);
      setRentalBlocks([]);
    }

    if (canViewOrders) {
      const response = await fetch("/api/admin/rental-bookings");
      if (response.ok) {
        const data = await response.json();
        setRentalBookings(data.bookings || []);
      } else {
        setRentalBookings([]);
      }
    } else {
      setRentalBookings([]);
    }

    if (canManageProducts) {
      const response = await fetch("/api/admin/projects");
      if (response.ok) {
        const data = await response.json();
        setProjects(data.projects || []);
        setProjectStorySetupRequired(data.storySetupRequired===true);
      } else {
        setProjects([]);
        setProjectStorySetupRequired(false);
      }
    } else {
      setProjects([]);
      setProjectStorySetupRequired(false);
    }

    if (canManageProducts) {
      const response = await fetch("/api/admin/site-settings");
      if (response.ok) { const data = await response.json(); setSiteSettings(data.settings || null); }
    }

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

  const activeOrders = orders.filter((order) => !order.archivedAt);

  const fresh = activeOrders.filter(
    (order) => order.status === "new"
  ).length;

  const working = activeOrders.filter((order) =>
    ["confirmed", "in_progress", "ready"].includes(order.status)
  ).length;

  const total = activeOrders.reduce(
    (sum, order) => sum + (order.totalOre || 0),
    0
  );

  const today = new Date().toISOString().slice(0, 10);
  const waitingQuotes = customerQuotes.filter(
    (quote) =>
      quote.status === "sent" &&
      (!quote.validUntil || quote.validUntil >= today)
  ).length;
  const acceptedQuoteValue = customerQuotes
    .filter((quote) => quote.status === "accepted")
    .reduce((sum, quote) => sum + (Number(quote.totalOre) || 0), 0);

  const tabs = [["overview", "Oversikt"]];

  if (canViewOrders) tabs.push(["orders", "Bestillinger"]);
  if (canViewOrders) tabs.push(["jobs", "Oppdrag"]);
  if (canViewOrders) tabs.push(["archive", "Arkiv"]);
  if (canViewOrders) tabs.push(["surveys", "Befaringer"]);
  if (canViewOrders) tabs.push(["customers", "Kunder"]);
  if (canManageProducts) tabs.push(["products", "Produkter"]);
  if (canManageProducts) tabs.push(["categories", "Kategorier"]);
  if (canManageProducts) tabs.push(["services", "Tjenester"]);
  if (canManageProducts) tabs.push(["rental", "Utleieutstyr"]);
  if (canViewOrders) tabs.push(["rentalCalendar", "Utleiekalender"]);
  if (canViewOrders) tabs.push(["rentalBookings", "Utleiebookinger"]);
  if (canManageProducts) tabs.push(["projects", "Tidligere oppdrag"]);
  if (canManageProducts) tabs.push(["homepage", "Forside"]);
  if (canManageProducts) tabs.push(["drawing", "Tegning & visualisering"]);
  if (canManageUsers) tabs.push(["users", "Brukere"]);

  function chooseTab(id) {
    if (id === "drawing") { setMenuOpen(false); router.push("/admin/tegning"); return; }
    setTab(id);
    setMenuOpen(false);
  }

  return (
    <main className={`admin${menuOpen ? " adminMenuOpen" : ""}`}>
      <header className="adminMobileHeader">
        <div className="brand"><span className="mark">AS</span><span>Aadland</span></div>
        <button className="adminMenuButton" type="button" aria-label={menuOpen ? "Lukk meny" : "Åpne meny"} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? "×" : "☰"}</button>
      </header>
      {menuOpen && <button className="adminMenuBackdrop" type="button" aria-label="Lukk meny" onClick={() => setMenuOpen(false)} />}
      <aside className="side">
        <div className="brand">
          <span className="mark">AS</span>
          Aadland
        </div>

        {tabs.map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => chooseTab(id)}
          >
            {label}
            {id === "orders" && fresh ? ` (${fresh})` : ""}
          </button>
        ))}

        {(canUpdateOrders || canManageProducts) && (
          <button onClick={() => { setMenuOpen(false); router.push("/admin/tilbud"); }}>
            Tilbud
          </button>
        )}

        <button onClick={() => { setMenuOpen(false); logout(); }}>Logg ut</button>
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
            : tab === "jobs"
            ? "Oppdrag"
            : tab === "archive"
            ? "Arkiv"
            : tab === "surveys"
            ? "Befaringer"
            : tab === "customers"
            ? "Kunder"
            : tab === "products"
            ? "Produkter"
            : tab === "categories"
            ? "Kategorier"
            : tab === "services"
            ? "Tjenester"
            : tab === "rental"
            ? "Utleieutstyr"
            : tab === "rentalCalendar"
            ? "Utleiekalender"
            : tab === "rentalBookings"
            ? "Utleiebookinger"
            : tab === "projects"
            ? "Tidligere oppdrag"
            : tab === "homepage"
            ? "Forside"
            : tab === "drawing"
            ? "Tegning & visualisering"
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
                <>
                  <div className="stat">
                    <span className="muted">
                      Tilbud venter svar
                    </span>
                    <br />
                    <b>{waitingQuotes}</b>
                  </div>
                  <div className="stat">
                    <span className="muted">
                      Godkjent tilbudsverdi
                    </span>
                    <br />
                    <b>{nok(acceptedQuoteValue)}</b>
                  </div>
                  <div className="stat">
                    <span className="muted">
                      Ordreverdi
                    </span>
                    <br />
                    <b>{nok(total)}</b>
                  </div>
                </>
              )}

              {canViewOrders && (
                <>
                  <div className="stat">
                    <span className="muted">Aktive utleier</span>
                    <br />
                    <b>{rentalBookings.filter((booking) => ["confirmed", "active"].includes(booking.status)).length}</b>
                  </div>
                  <div className="stat">
                    <span className="muted">Nye utleiebookinger</span>
                    <br />
                    <b>{rentalBookings.filter((booking) => booking.status === "new").length}</b>
                  </div>
                </>
              )}
            </div>

            {(canUpdateOrders || canManageProducts) && (
              <div className="adminOverviewActions">
                <button className="btn alt" type="button" onClick={() => router.push("/admin/tilbud")}>Åpne tilbudsoversikt</button>
              </div>
            )}

            {canViewOrders && (
              <Orders
                orders={activeOrders.slice(0, 5)}
                status={status}
                canUpdateOrders={canUpdateOrders}
                reload={load}
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
            orders={activeOrders.filter(order => order.orderType !== "custom")}
            status={status}
            canUpdateOrders={canUpdateOrders}
            reload={load}
          />
        )}

        {tab === "jobs" && canViewOrders && (
          <Jobs
            orders={activeOrders.filter(order => order.orderType === "custom" && order.sourceQuoteId)}
            status={status}
            canUpdateOrders={canUpdateOrders}
            reload={load}
          />
        )}

        {tab === "archive" && canViewOrders && (
          <Archive orders={orders} reload={load} setError={setError} canUpdate={canUpdateOrders} />
        )}

        {tab === "surveys" && canViewOrders && (
          <Surveys orders={activeOrders.filter(order => order.orderType === "custom" && !order.sourceQuoteId)} status={status} canUpdateOrders={canUpdateOrders} />
        )}

        {tab === "customers" && canViewOrders && (
          <Customers orders={orders} bookings={rentalBookings} profiles={customerProfiles} quotes={customerQuotes} />
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

        {tab === "rental" && canManageProducts && (
          <RentalItems items={rentalItems} categories={rentalCategories} blocks={rentalBlocks} reload={load} setError={setError} categorySetupRequired={rentalCategorySetupRequired} />
        )}

        {tab === "rentalCalendar" && canViewOrders && (
          <RentalCalendar items={rentalItems} bookings={rentalBookings} blocks={rentalBlocks} />
        )}

        {tab === "rentalBookings" && canViewOrders && (
          <RentalBookings bookings={rentalBookings} reload={load} setError={setError} canUpdate={canUpdateOrders} />
        )}

        {tab === "projects" && canManageProducts && (
          <Projects projects={projects} reload={load} setError={setError} storySetupRequired={projectStorySetupRequired} />
        )}

        {tab === "homepage" && canManageProducts && (
          <HomepageManager services={services} projects={projects} settings={siteSettings} reload={load} setTab={setTab} setError={setError} />
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

function Archive({orders,reload,setError,canUpdate}){
 const archived=(orders||[]).filter(o=>o.archivedAt);
 async function restore(id){const r=await fetch("/api/admin/orders",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,action:"restore"})}),d=await r.json().catch(()=>({}));if(!r.ok){setError(d.error||"Kunne ikke gjenopprette.");return;}await reload()}
 return <div className="orderCards">{archived.length?archived.map(o=><article className="card orderCard" key={o.id}><div className="kicker">{o.orderNumber}</div><h3>{o.customerName||"Ukjent kunde"}</h3><p>{o.orderType==="custom"?(o.sourceQuoteId?"Oppdrag":"Befaring/forespørsel"):"Bestilling"} · {nok(o.totalOre||0)}<br/><small className="muted">Arkivert {new Date(o.archivedAt).toLocaleString("nb-NO")}</small></p>{canUpdate&&<button className="btn alt" onClick={()=>restore(o.id)}>Gjenopprett</button>}</article>):<div className="card"><h3>Arkivet er tomt</h3><p className="muted">Ferdige eller avbrutte saker kan flyttes hit uten at historikken slettes.</p></div>}</div>
}

function customerQuoteHref(customer){
 const params=new URLSearchParams();
 if(customer?.name)params.set("name",customer.name);
 if(customer?.email)params.set("email",customer.email);
 if(customer?.phone)params.set("phone",customer.phone);
 if(customer?.address)params.set("address",customer.address);
 const query=params.toString();
 return "/admin/tilbud/ny"+(query?"?"+query:"");
}

function Customers({orders,bookings,profiles,quotes}) {
  const [query,setQuery]=useState("");
  const [accountFilter,setAccountFilter]=useState("all");
  const customers=new Map();
  function keyFor(customer){
    const email=String(customer?.email||"").trim().toLowerCase();
    const phone=String(customer?.phone||"").replace(/\s/g,"");
    return email||phone||String(customer?.name||"").trim().toLowerCase();
  }
  function ensure(customer){
    const key=keyFor(customer);
    if(!key)return null;
    const current=customers.get(key)||{
      name:customer?.name||"Ukjent kunde",
      email:customer?.email||"",
      phone:customer?.phone||"",
      address:customer?.address||"",
      orders:0,rentals:0,quotes:0,totalOre:0,lastDate:null,history:[],
      hasAccount:false,accountCreatedAt:null
    };
    if(customer?.name)current.name=customer.name;
    if(customer?.email)current.email=customer.email;
    if(customer?.phone)current.phone=customer.phone;
    if(customer?.address)current.address=customer.address;
    customers.set(key,current);
    return current;
  }
  function add(customer,entry){
    const current=ensure(customer);
    if(!current)return;
    if(entry.type==="order")current.orders+=1;else current.rentals+=1;
    current.totalOre+=Number(entry.totalOre)||0;
    current.history.push(entry);
    if(!current.lastDate||String(entry.date)>String(current.lastDate))current.lastDate=entry.date;
  }
  (profiles||[]).forEach(profile=>{
    const current=ensure(profile);
    if(!current)return;
    current.hasAccount=true;
    current.accountCreatedAt=profile.createdAt||null;
    if(profile.name)current.name=profile.name;
    if(profile.phone)current.phone=profile.phone;
    if(profile.address)current.address=profile.address;
  });
  (quotes||[]).forEach(q=>{
    const current=ensure(q.customer);
    if(!current)return;
    current.quotes+=1;
    const date=q.acceptedAt||q.declinedAt||q.sentAt||q.createdAt;
    current.history.push({type:"quote",number:q.quoteNumber,date,totalOre:q.totalOre||0,label:"Tilbud · "+(q.title||"Tilbud"),href:"/admin/tilbud/"+q.id});
    if(!current.lastDate||String(date)>String(current.lastDate))current.lastDate=date;
  });
  (orders||[]).forEach(o=>add(o.customer||{name:o.customerName,email:o.customerEmail,phone:o.customerPhone},{type:"order",number:o.orderNumber,date:o.createdAt,totalOre:o.totalOre||0,label:o.orderType==="custom"?(o.sourceQuoteId?"Oppdrag":"Befaring/forespørsel"):"Bestilling"}));
  (bookings||[]).forEach(b=>add(b.customer,{type:"rental",number:b.bookingNumber,date:b.createdAt,totalOre:b.totalOre||0,label:"Utleie"}));
  const q=query.trim().toLowerCase(),list=[...customers.values()]
   .filter(c=>!q||[c.name,c.email,c.phone,c.address].some(v=>String(v||"").toLowerCase().includes(q)))
   .filter(c=>accountFilter==="all"||(accountFilter==="account"?c.hasAccount:!c.hasAccount))
   .sort((x,y)=>String(y.lastDate||"").localeCompare(String(x.lastDate||"")));
  return <><div className="card customerSearch"><div className="kicker">KUNDEREGISTER</div><h3>{customers.size} kunder fra kundekonto, tilbud, bestillinger, befaringer og utleie</h3><div className="customerSearchControls"><div className="field"><label>Søk</label><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Navn, e-post, telefon eller adresse"/></div><div className="field"><label>Kundekonto</label><select value={accountFilter} onChange={e=>setAccountFilter(e.target.value)}><option value="all">Alle kunder</option><option value="account">Har kundekonto</option><option value="guest">Uten kundekonto</option></select></div></div></div>
  <div className="grid customerGrid">{list.map((c,i)=><article className="card" key={(c.email||c.phone||c.name)+i}><div className="customerAdminCardTop"><h3>{c.name}</h3>{c.hasAccount&&<span className="customerAccountBadge">Kundekonto</span>}</div><p>{c.phone&&<><a href={"tel:"+c.phone}>{c.phone}</a><br/></>}{c.email&&<><a href={"mailto:"+c.email}>{c.email}</a><br/></>}{c.address}</p><p><b>{c.quotes}</b> tilbud · <b>{c.orders}</b> bestilling/befaring · <b>{c.rentals}</b> utleie<br/>Registrert verdi: <b>{nok(c.totalOre)}</b>{c.accountCreatedAt&&<><br/><small className="muted">Kundekonto opprettet {new Date(c.accountCreatedAt).toLocaleDateString("nb-NO")}</small></>}</p><div className="customerAdminActions"><a className="btn alt" href={customerQuoteHref(c)}>Nytt tilbud</a>{c.email&&<a className="btn alt" href={"mailto:"+c.email}>Send e-post</a>}</div><details><summary>Vis historikk ({c.history.length})</summary>{c.history.sort((x,y)=>String(y.date||"").localeCompare(String(x.date||""))).map((h,j)=><div key={h.number+j} className="customerHistory">{h.href?<a href={h.href}><b>{h.label}</b> · {h.number}</a>:<><b>{h.label}</b> · {h.number}</>}<br/><small>{h.date?new Date(h.date).toLocaleString("nb-NO"):""} · {nok(h.totalOre||0)}</small></div>)}</details></article>)}</div>{!list.length&&<div className="card"><p>Ingen kunder funnet.</p></div>}</>;
}

function Orders({ orders, status, canUpdateOrders, reload }) {
 const [openId,setOpenId]=useState(null),[savingId,setSavingId]=useState(null),[message,setMessage]=useState("");
 async function archive(order){
  if(!confirm("Flytte denne til arkivet?"))return;
  setSavingId(order.id);
  setMessage("");
  const r=await fetch("/api/admin/orders",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:order.id,action:"archive"})});
  const d=await r.json().catch(()=>({}));
  setSavingId(null);
  if(!r.ok){
   setMessage(d.error||"Oppdraget kunne ikke arkiveres.");
   return;
  }
  setOpenId(null);
  setMessage("Flyttet til arkivet.");
  if(typeof reload==="function")await reload();
 }
 async function saveTracking(order){
  setSavingId(order.id);
  const trackingNumber=document.getElementById("tracking-number-"+order.id)?.value||"",trackingUrl=document.getElementById("tracking-url-"+order.id)?.value||"";
  await fetch("/api/admin/orders",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:order.id,trackingNumber,trackingUrl})});
  setSavingId(null);
 }
 async function finish(order,action){setSavingId(order.id);setMessage("");const r=await fetch("/api/admin/orders",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:order.id,action})}),d=await r.json().catch(()=>({}));setSavingId(null);if(!r.ok){setMessage(d.error||"Handlingen kunne ikke utføres.");return;}setMessage(d.paymentCaptureRequired?"Status er lagret. Betalingen står fortsatt bare som reservert til betalingsleverandøren er koblet til.":"Status er lagret.");window.setTimeout(()=>window.location.reload(),700);}
 return <><>{message&&<p className="notice">{message}</p>}</><div className="orderCards">{orders.length?orders.map(order=><article className="card orderCard" key={order.id}>
  <div className="orderCardTop"><div><div className="kicker">{order.orderNumber}</div><h3>{order.customerName||"Ukjent kunde"}</h3><small className="muted">{new Date(order.createdAt).toLocaleString("nb-NO")}</small></div><b>{nok(order.totalOre||0)}</b></div>
  <p>{order.customerPhone&&<>{order.customerPhone}<br/></>}{order.customerEmail}</p>
  <div className="orderBadges"><span>{order.fulfillmentType==="delivery"?"Levering":order.fulfillmentType==="shipping"?"Sending":"Henting"}</span><span>Betaling: {order.paymentStatus==="pending"?"Venter":order.paymentStatus==="authorized"?"Reservert":order.paymentStatus==="paid"?"Betalt":order.paymentStatus==="refunded"?"Refundert":order.paymentStatus}</span></div>
  <div className="field"><label>Status</label>{canUpdateOrders?<select value={order.status} onChange={e=>status(order.id,e.target.value)}>{Object.entries(labels).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select>:<b>{labels[order.status]||order.status}</b>}</div>
  <button className="btn alt" type="button" onClick={()=>setOpenId(openId===order.id?null:order.id)}>{openId===order.id?"Skjul detaljer":"Vis detaljer"}</button>
  {openId===order.id&&<div className="orderDetails">
   {(order.items||[]).length>0&&<div><h4>Varer</h4>{order.items.map((item,i)=><p key={i}>{item.quantity||1} × {item.name||"Produkt"} · {nok((item.unitPriceOre||0)*(item.quantity||1))}</p>)}</div>}
   {order.customRequest&&<p style={{whiteSpace:"pre-wrap"}}>{order.customRequest}</p>}{Array.isArray(order.contactImages)&&order.contactImages.length>0&&<div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:12}}>{order.contactImages.map((image,i)=><a className="btn alt" key={image.ref||i} href={image.url} target="_blank" rel="noopener noreferrer">Åpne bilde {i+1}</a>)}</div>}
   {order.fulfillmentType==="shipping"&&<><div className="field"><label>Sporingsnummer</label><input id={"tracking-number-"+order.id} defaultValue={order.trackingNumber||""}/></div><div className="field"><label>Sporingslenke</label><input type="url" id={"tracking-url-"+order.id} defaultValue={order.trackingUrl||""}/></div>{canUpdateOrders&&<button className="btn" type="button" disabled={savingId===order.id} onClick={()=>saveTracking(order)}>{savingId===order.id?"Lagrer …":"Lagre sporing"}</button>}</>}
  </div>}
 {canUpdateOrders&&<div className="orderActions">{["completed","cancelled"].includes(order.status)&&<button className="btn alt" type="button" disabled={savingId===order.id} onClick={()=>archive(order)}>Arkiver</button>}{order.orderType!=="custom"&&order.status!=="completed"&&(order.fulfillmentType==="shipping"?<button className="btn" type="button" disabled={savingId===order.id} onClick={()=>finish(order,"mark-dispatched")}>Sendt til kunde</button>:<button className="btn" type="button" disabled={savingId===order.id} onClick={()=>finish(order,"mark-delivered")}>Levert til kunde</button>)}</div>}
 </article>):<div className="card"><p>Ingen bestillinger ennå.</p></div>}</div></>;
}

function Jobs({orders,status,canUpdateOrders,reload}){
 const [openId,setOpenId]=useState(null);
 const [savingId,setSavingId]=useState("");
 const [message,setMessage]=useState("");

 async function archive(order){
  if(!confirm("Flytte dette oppdraget til arkivet?"))return;
  setSavingId(order.id);setMessage("");
  const response=await fetch("/api/admin/orders",{
   method:"PATCH",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({id:order.id,action:"archive"})
  });
  const data=await response.json().catch(()=>({}));
  setSavingId("");
  if(!response.ok){setMessage(data.error||"Oppdraget kunne ikke arkiveres.");return}
  setMessage("Oppdraget er flyttet til arkivet.");
  if(typeof reload==="function")await reload();
 }

 const labels={
  new:"Ny",
  confirmed:"Bekreftet",
  in_progress:"Under arbeid",
  ready:"Klar",
  completed:"Ferdig",
  cancelled:"Avbrutt"
 };

 if(!orders.length)return <div className="card"><h3>Ingen oppdrag ennå</h3><p className="muted">Når et godkjent tilbud gjøres om til oppdrag, vises det her.</p></div>;

 return <>
  {message&&<p className="notice">{message}</p>}
  <div className="jobGrid">
   {orders.map(order=><article className="card jobCard" key={order.id}>
    <div className="jobCardTop">
     <div>
      <div className="kicker">{order.orderNumber}</div>
      <h3>{order.sourceQuoteTitle||"Oppdrag"}</h3>
      <p>{order.customerName||"Ukjent kunde"}</p>
     </div>
     <b>{nok(order.totalOre||0)}</b>
    </div>

    <div className="jobQuoteLink">
     <div>
      <small>Opprettet fra tilbud</small>
      <b>{order.sourceQuoteNumber}</b>
     </div>
     <div className="jobQuoteActions">
      <a className="btn alt" href={"/admin/tilbud/"+order.sourceQuoteId}>Åpne tilbud</a>
      <a className="btn" href={"/admin/oppdrag/"+order.id+"/planlegg"}>{order.jobStartAt?"Rediger plan":"Planlegg oppdrag"}</a>
     </div>
    </div>

    <div className="jobMeta">
     <span><small>Avtalt oppstart</small><b>{order.jobStartAt?new Date(order.jobStartAt).toLocaleString("nb-NO"):"Ikke avtalt"}</b></span>
     <span><small>Tidligst oppstart i tilbud</small><b>{order.sourceQuotePlannedStartDate?new Date(order.sourceQuotePlannedStartDate+"T12:00:00").toLocaleDateString("nb-NO"):"Ikke satt"}</b></span>
     <span><small>Bekreftelse</small><b>{order.jobConfirmationSentAt?"Sendt "+new Date(order.jobConfirmationSentAt).toLocaleString("nb-NO"):"Ikke sendt"}</b></span>
     <span><small>Godkjent</small><b>{order.sourceQuoteAcceptedAt?new Date(order.sourceQuoteAcceptedAt).toLocaleString("nb-NO"):"—"}</b></span>
     <span><small>Avtalt total</small><b>{nok(order.sourceQuoteTotalOre||order.totalOre||0)}</b></span>
    </div>

    <div className="field">
     <label>Status</label>
     {canUpdateOrders
      ?<select value={order.status} onChange={e=>status(order.id,e.target.value)}>{Object.entries(labels).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select>
      :<b>{labels[order.status]||order.status}</b>}
    </div>

    <button className="btn alt" type="button" onClick={()=>setOpenId(openId===order.id?null:order.id)}>{openId===order.id?"Skjul detaljer":"Vis detaljer"}</button>

    {openId===order.id&&<div className="jobDetails">
     {order.customerPhone&&<p><b>Telefon:</b> <a href={"tel:"+order.customerPhone}>{order.customerPhone}</a></p>}
     {order.customerEmail&&<p><b>E-post:</b> <a href={"mailto:"+order.customerEmail}>{order.customerEmail}</a></p>}
     {order.customer?.address&&<p><b>Arbeidssted:</b> {order.customer.address}</p>}
     {order.customRequest&&<div className="jobDescription">{order.customRequest}</div>}
     {Array.isArray(order.sourceQuotePaymentPlan)&&order.sourceQuotePaymentPlan.length>0&&<div className="jobPaymentPlan">
      <h4>Betalingsplan</h4>
      {order.sourceQuotePaymentPlan.map((row,index)=><div key={row.id||index}>
       <span><b>{row.label||("Delbetaling "+(index+1))}</b><small>{row.trigger||""}</small></span>
       <b>{row.percent}% · {nok((order.sourceQuoteTotalOre||order.totalOre||0)*(Number(row.percent)||0)/100)}</b>
      </div>)}
     </div>}
    </div>}

    {canUpdateOrders&&["completed","cancelled"].includes(order.status)&&<button className="btn alt" type="button" disabled={savingId===order.id} onClick={()=>archive(order)}>{savingId===order.id?"Flytter …":"Arkiver oppdrag"}</button>}
   </article>)}
  </div>
 </>;
}

function Surveys({ orders, status, canUpdateOrders }) {
  const [savingId,setSavingId]=useState("");
  async function saveSurvey(order, surveyDate, adminNote){
    setSavingId(order.id);
    const response=await fetch("/api/admin/orders",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:order.id,surveyDate,adminNote})});
    setSavingId("");
    if(response.ok) window.location.reload();
  }
  const surveyLabels = {
    new: "Ny forespørsel",
    confirmed: "Avtalt",
    in_progress: "Under arbeid",
    ready: "Klar for oppfølging",
    completed: "Ferdig",
    cancelled: "Avbrutt",
  };

  if (!orders.length) {
    return <div className="card"><h3>Ingen befaringer ennå</h3><p className="muted">Forespørsler fra befaring-skjemaet vil vises her automatisk.</p></div>;
  }

  return <div className="grid">
    {orders.map(order => {
      const customer = order.customer || {};
      return <article className="card" key={order.id}>
        <div style={{display:"flex",justifyContent:"space-between",gap:16,alignItems:"flex-start",flexWrap:"wrap"}}>
          <div>
            <small className="muted">{order.orderNumber} · {new Date(order.createdAt).toLocaleString("nb-NO")}</small>
            <h3 style={{marginBottom:6}}>{order.customerName || "Ukjent kunde"}</h3>
            <div className="muted">{order.customerPhone}{order.customerEmail ? " · "+order.customerEmail : ""}</div>
          </div>
          {canUpdateOrders ? <select value={order.status} onChange={e=>status(order.id,e.target.value)}>
            {Object.entries(surveyLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}
          </select> : <b>{surveyLabels[order.status] || order.status}</b>}
        </div>
        {(customer.address || customer.postalCode || customer.city) && <p><b>Adresse:</b> {[customer.address,customer.postalCode,customer.city].filter(Boolean).join(", ")}</p>}
        <div style={{whiteSpace:"pre-wrap",lineHeight:1.55,marginTop:16}}>{order.customRequest || "Ingen beskrivelse."}</div>{Array.isArray(order.contactImages)&&order.contactImages.length>0&&<div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:12}}>{order.contactImages.map((image,i)=><a className="btn alt" key={image.ref||i} href={image.url} target="_blank" rel="noopener noreferrer">Åpne bilde {i+1}</a>)}</div>}
        <div className="field" style={{marginTop:16}}><label>Dato og tid for befaring</label><input type="datetime-local" defaultValue={order.surveyDate ? String(order.surveyDate).slice(0,16) : ""} id={"survey-date-"+order.id}/></div>
        <div className="field"><label>Internt notat</label><textarea rows="3" defaultValue={order.adminNote||""} id={"survey-note-"+order.id} placeholder="Kun synlig i backoffice"/></div>
        {canUpdateOrders&&<button className="btn alt" type="button" disabled={savingId===order.id} onClick={()=>saveSurvey(order,document.getElementById("survey-date-"+order.id).value,document.getElementById("survey-note-"+order.id).value)}>{savingId===order.id?"Lagrer …":"Lagre befaring"}</button>}
        <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:18}}>
          {order.customerPhone && <a className="btn" href={"tel:"+order.customerPhone}>Ring kunde</a>}
          {order.customerEmail && <a className="btn alt" href={"mailto:"+order.customerEmail}>Send e-post</a>}
          {canUpdateOrders && <a className="btn alt" href={"/admin/tilbud/ny?orderId="+order.id}>Lag tilbud</a>}
        </div>
      </article>;
    })}
  </div>;
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
  const [inventoryMode,setInventoryMode]=useState(product?.inventoryMode||"made_to_order");
  const [stockQuantity,setStockQuantity]=useState(String(product?.stockQuantity??0));
  const [restockDate,setRestockDate]=useState(product?.restockDate||"");
  const [leadTimeText,setLeadTimeText]=useState(product?.leadTimeText||"");
  const [shippable,setShippable]=useState(product?.shippable===true);
  const [shippingPrice,setShippingPrice]=useState(product?String((Number(product.shippingPriceOre)||0)/100):"");
  const [weightGrams,setWeightGrams]=useState(product?.weightGrams??"");
  const [shippingLengthCm,setShippingLengthCm]=useState(product?.shippingLengthCm??"");
  const [shippingWidthCm,setShippingWidthCm]=useState(product?.shippingWidthCm??"");
  const [shippingHeightCm,setShippingHeightCm]=useState(product?.shippingHeightCm??"");

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
    setInventoryMode(product.inventoryMode||"made_to_order"); setStockQuantity(String(product.stockQuantity??0)); setRestockDate(product.restockDate||""); setLeadTimeText(product.leadTimeText||""); setShippable(product.shippable===true); setShippingPrice(String((Number(product.shippingPriceOre)||0)/100)); setWeightGrams(product.weightGrams??""); setShippingLengthCm(product.shippingLengthCm??""); setShippingWidthCm(product.shippingWidthCm??""); setShippingHeightCm(product.shippingHeightCm??"");
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
          inventoryMode, stockQuantity:Number(stockQuantity)||0, restockDate:restockDate||null, leadTimeText:leadTimeText.trim(), shippable, shippingPriceOre:Math.round((Number(String(shippingPrice).replace(",","."))||0)*100), weightGrams:weightGrams||null, shippingLengthCm:shippingLengthCm||null, shippingWidthCm:shippingWidthCm||null, shippingHeightCm:shippingHeightCm||null,
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
          inventoryMode:product.inventoryMode||"made_to_order", stockQuantity:product.stockQuantity||0, restockDate:product.restockDate||null, leadTimeText:product.leadTimeText||"", shippable:product.shippable===true, shippingPriceOre:product.shippingPriceOre||0, weightGrams:product.weightGrams||null, shippingLengthCm:product.shippingLengthCm||null, shippingWidthCm:product.shippingWidthCm||null, shippingHeightCm:product.shippingHeightCm||null,
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
          {" · "}{product.inventoryMode==="stock"?(product.stockQuantity>0?product.stockQuantity+" på lager":"Utsolgt"):"Produseres på bestilling"}
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

      <div className="field"><label>Lagertype</label><select value={inventoryMode} onChange={e=>setInventoryMode(e.target.value)}><option value="made_to_order">Produseres på bestilling – ubegrenset</option><option value="stock">Lagervare – bruk lagerantall</option></select></div>
      {inventoryMode==="stock"?<><div className="field"><label>Antall på lager</label><input type="number" min="0" step="1" value={stockQuantity} onChange={e=>setStockQuantity(e.target.value)}/></div><div className="field"><label>Forventet tilbake på lager</label><input type="date" value={restockDate} onChange={e=>setRestockDate(e.target.value)}/></div></>:<div className="field"><label>Forventet produksjons-/leveringstid</label><input value={leadTimeText} onChange={e=>setLeadTimeText(e.target.value)} placeholder="F.eks. 2–3 uker"/></div>}
      <div className="field"><label><input type="checkbox" checked={shippable} onChange={e=>setShippable(e.target.checked)}/> Kan sendes med post/Bring</label></div>
      {shippable&&<div style={{border:"1px solid #ddd",borderRadius:12,padding:14,marginBottom:18}}><div className="field"><label>Standard fraktpris i kroner</label><input type="number" min="0" step="1" value={shippingPrice} onChange={e=>setShippingPrice(e.target.value)} placeholder="0"/></div><p className="muted">Mål og vekt lagres også slik at vi senere kan koble på automatisk Bring-beregning.</p><div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8}}><input type="number" min="0" value={weightGrams} onChange={e=>setWeightGrams(e.target.value)} placeholder="Vekt gram"/><input type="number" min="0" step="0.1" value={shippingLengthCm} onChange={e=>setShippingLengthCm(e.target.value)} placeholder="Lengde cm"/><input type="number" min="0" step="0.1" value={shippingWidthCm} onChange={e=>setShippingWidthCm(e.target.value)} placeholder="Bredde cm"/><input type="number" min="0" step="0.1" value={shippingHeightCm} onChange={e=>setShippingHeightCm(e.target.value)} placeholder="Høyde cm"/></div></div>}

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
    <div className="field"><label>Beskrivelse</label><textarea rows="4" value={description} onChange={e=>setDescription(e.target.value)} /></div>
    <div className="field"><label>Type</label><select value={kind} onChange={e=>setKind(e.target.value)}><option value="service">Vanlig tjeneste</option><option value="rental">Utleie</option><option value="products">Produkter på bestilling</option><option value="survey">Befaring</option></select></div>
    <div className="field"><label>Bilde</label>{imageUrl&&<img src={imageUrl} alt="" style={{width:"100%",height:180,objectFit:"cover",borderRadius:12,marginBottom:10}}/>}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={e=>uploadImage(e.target.files?.[0])}/>{uploading&&<small className="muted">Laster opp …</small>}</div>
    <div className="field"><label>Rekkefølge</label><input type="number" value={sortOrder} onChange={e=>setSortOrder(e.target.value)} /></div>
    <div className="field"><label>Publiser fra (valgfritt)</label><input type="date" value={publishFrom} onChange={e=>setPublishFrom(e.target.value)} /></div>
    <div className="field"><label>Publiser til (valgfritt)</label><input type="date" value={publishUntil} onChange={e=>setPublishUntil(e.target.value)} /></div>
    <label><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)} /> Publisert</label><br/>
    <label><input type="checkbox" checked={showOnHome} onChange={e=>setShowOnHome(e.target.checked)} /> Vis på forsiden</label><br/>
    <label><input type="checkbox" checked={showInMenu} onChange={e=>setShowInMenu(e.target.checked)} /> Vis i meny</label><br/>
    <label><input type="checkbox" checked={showInFooter} onChange={e=>setShowInFooter(e.target.checked)} /> Vis i footer</label><br/>
    <label><input type="checkbox" checked={hasPage} onChange={e=>setHasPage(e.target.checked)} /> Egen tjenesteside</label>
    <div className="field" style={{marginTop:16}}><label>Tekst på knapp</label><input value={ctaLabel} onChange={e=>setCtaLabel(e.target.value)} placeholder="Les mer" /></div>
    <div className="field"><label>Overskrift i forespørsel</label><input value={formTitle} onChange={e=>setFormTitle(e.target.value)} /></div>
    <div className="field"><label>Hjelpetekst i forespørsel</label><textarea rows="3" value={formPrompt} onChange={e=>setFormPrompt(e.target.value)} /></div>
    <div style={{display:"flex",gap:10,marginTop:18}}><button className="btn" disabled={saving}>{saving?"Lagrer …":"Lagre"}</button>{!isNew&&<button type="button" className="btn alt" onClick={()=>setEditing(false)}>Avbryt</button>}</div>
  </form>;
}

function RentalItems({items,blocks,reload,setError}){
 const [showNew,setShowNew]=useState(false);
 const [block,setBlock]=useState({itemId:"",startDate:"",endDate:"",reason:""});
 async function addBlock(e){e.preventDefault();setError("");const r=await fetch("/api/admin/rental/blocks",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(block)});const d=await r.json().catch(()=>({}));if(!r.ok){setError(d.error||"Perioden kunne ikke blokkeres.");return;}setBlock({itemId:"",startDate:"",endDate:"",reason:""});await reload();}
 async function removeBlock(id){const r=await fetch("/api/admin/rental/blocks",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id})});if(!r.ok){setError("Blokkeringen kunne ikke fjernes.");return;}await reload();}
 return <><div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:20}}><a className="btn alt" href="/admin/utleiekategorier">Utleiekategorier</a><a className="btn" href="/admin/utleie/ny">Legg til utstyr</a></div>
 <div className="grid">{items.map(item=><RentalEditor key={item.id} item={item} reload={reload} setError={setError}/>)}</div>
 <div className="card" style={{marginTop:24}}><div className="kicker">Tilgjengelighet</div><h3>Blokker datoer manuelt</h3><p className="muted">Bruk dette ved service, eget bruk eller andre perioder utstyret ikke kan leies ut.</p>
 <form onSubmit={addBlock}><div className="field"><label>Utstyr</label><select required value={block.itemId} onChange={e=>setBlock({...block,itemId:e.target.value})}><option value="">Velg utstyr</option>{items.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select></div>
 <div style={{display:"flex",gap:12,flexWrap:"wrap"}}><div className="field"><label>Fra</label><input required type="date" value={block.startDate} onChange={e=>setBlock({...block,startDate:e.target.value})}/></div><div className="field"><label>Til</label><input required type="date" min={block.startDate} value={block.endDate} onChange={e=>setBlock({...block,endDate:e.target.value})}/></div></div>
 <div className="field"><label>Årsak</label><input value={block.reason} onChange={e=>setBlock({...block,reason:e.target.value})} placeholder="F.eks. service"/></div><button className="btn">Blokker periode</button></form>
 {blocks.length>0&&<div style={{marginTop:18}}>{blocks.map(b=><div key={b.id} style={{display:"flex",justifyContent:"space-between",gap:12,padding:"10px 0",borderTop:"1px solid #ddd"}}><span><b>{items.find(i=>i.id===b.itemId)?.name||"Utstyr"}</b> · {b.startDate} – {b.endDate}{b.reason?" · "+b.reason:""}</span><button className="btn alt" onClick={()=>removeBlock(b.id)}>Fjern</button></div>)}</div>}</div></>;
}
function RentalEditor({item,reload,setError,close}){
 const isNew=!item,[editing,setEditing]=useState(isNew),[saving,setSaving]=useState(false),[uploading,setUploading]=useState(false);
 const [v,setV]=useState({name:item?.name||"",description:item?.description||"",status:item?.status||"available",quantity:item?.quantity||1,dailyPriceOre:item?.dailyPriceOre||0,weekendPriceOre:item?.weekendPriceOre??"",weeklyPriceOre:item?.weeklyPriceOre??"",longTermDays:item?.longTermDays??"",longTermDiscountPercent:item?.longTermDiscountPercent||0,depositOre:item?.depositOre||0,bufferDays:item?.bufferDays||0,pickupAvailable:item?.pickupAvailable!==false,deliveryAvailable:item?.deliveryAvailable===true,active:item?.active!==false,sortOrder:item?.sortOrder||0,imageUrls:item?.imageUrls||[]});
 const set=(k,x)=>setV({...v,[k]:x});
 async function upload(files){const list=Array.from(files||[]);if(!list.length)return;setUploading(true);const urls=[];for(const file of list){const fd=new FormData();fd.append("file",file);const r=await fetch("/api/admin/upload",{method:"POST",body:fd});const d=await r.json().catch(()=>({}));if(r.ok&&d.url)urls.push(d.url);else setError(d.error||"Et bilde kunne ikke lastes opp.");}setV(x=>({...x,imageUrls:[...x.imageUrls,...urls]}));setUploading(false);}
 async function save(e){e.preventDefault();setSaving(true);setError("");const r=await fetch("/api/admin/rental",{method:isNew?"POST":"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({...v,...(!isNew?{id:item.id}:{})})});const d=await r.json().catch(()=>({}));setSaving(false);if(!r.ok){setError(d.error||"Utstyret kunne ikke lagres.");return;}if(close)close();else setEditing(false);await reload();}
 async function remove(){if(!item?.id||!window.confirm('Slette "'+item.name+'"?'))return;const r=await fetch("/api/admin/rental",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:item.id})});const d=await r.json().catch(()=>({}));if(!r.ok){setError(d.error||"Utstyret kunne ikke slettes.");return;}await reload();}
 if(!editing&&item)return <div className="card">{item.imageUrls?.[0]&&<img src={item.imageUrls[0]} alt="" style={{width:"100%",height:190,objectFit:"cover",borderRadius:12}}/>}<div className="kicker">{item.status==="available"?"Tilgjengelig":item.status==="maintenance"?"Service":"Ikke tilgjengelig"}</div><h3>{item.name}</h3><p>{item.description}</p><p><b>{nok(item.dailyPriceOre)}</b> / dag · Depositum {nok(item.depositOre)}</p><div style={{display:"flex",gap:10}}><button className="btn" onClick={()=>setEditing(true)}>Rediger</button><button className="btn alt" onClick={remove}>Slett</button></div></div>;
 return <form className="card" onSubmit={save}><div className="kicker">{isNew?"Nytt utleieutstyr":"Rediger utstyr"}</div><h3>{isNew?"Legg til utstyr":item.name}</h3>
 <div className="field"><label>Navn</label><input required value={v.name} onChange={e=>set("name",e.target.value)}/></div><div className="field"><label>Beskrivelse</label><textarea rows="3" value={v.description} onChange={e=>set("description",e.target.value)}/></div>
 <div className="field"><label>Bilder</label>{v.imageUrls.map((url,i)=><div key={url+i} style={{marginBottom:8}}><img src={url} alt="" style={{width:180,height:110,objectFit:"cover",borderRadius:10}}/><button type="button" className="btn alt" onClick={()=>set("imageUrls",v.imageUrls.filter((_,x)=>x!==i))}>Fjern</button></div>)}<input type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={e=>{upload(e.target.files);e.target.value=""}}/>{uploading&&<small>Laster opp …</small>}</div>
 <div className="field"><label>Status</label><select value={v.status} onChange={e=>set("status",e.target.value)}><option value="available">Tilgjengelig</option><option value="unavailable">Midlertidig utilgjengelig</option><option value="maintenance">Service/vedlikehold</option><option value="hidden">Skjult</option></select></div>
 <div className="field"><label>Antall</label><input type="number" min="1" value={v.quantity} onChange={e=>set("quantity",e.target.value)}/></div>
 <div className="field"><label>Døgnpris (kr)</label><input type="number" min="0" value={(Number(v.dailyPriceOre)||0)/100} onChange={e=>set("dailyPriceOre",Math.round(Number(e.target.value||0)*100))}/></div>
 <div className="field"><label>Helgepris (kr)</label><input type="number" min="0" value={v.weekendPriceOre===""?"":Number(v.weekendPriceOre)/100} onChange={e=>set("weekendPriceOre",e.target.value===""?"":Math.round(Number(e.target.value)*100))}/></div>
 <div className="field"><label>Ukepris (kr)</label><input type="number" min="0" value={v.weeklyPriceOre===""?"":Number(v.weeklyPriceOre)/100} onChange={e=>set("weeklyPriceOre",e.target.value===""?"":Math.round(Number(e.target.value)*100))}/></div>
 <div className="field"><label>Depositum (kr)</label><input type="number" min="0" value={(Number(v.depositOre)||0)/100} onChange={e=>set("depositOre",Math.round(Number(e.target.value||0)*100))}/></div>
 <div className="field"><label>Buffer mellom utleier (dager)</label><input type="number" min="0" value={v.bufferDays} onChange={e=>set("bufferDays",e.target.value)}/></div><div className="field"><label>Langtidsgrense (dager)</label><input type="number" min="1" value={v.longTermDays} onChange={e=>set("longTermDays",e.target.value)}/></div><div className="field"><label>Langtidsrabatt (%)</label><input type="number" min="0" max="100" value={v.longTermDiscountPercent} onChange={e=>set("longTermDiscountPercent",e.target.value)}/></div>
 <label><input type="checkbox" checked={v.pickupAvailable} onChange={e=>set("pickupAvailable",e.target.checked)}/> Henting mulig</label><br/><label><input type="checkbox" checked={v.deliveryAvailable} onChange={e=>set("deliveryAvailable",e.target.checked)}/> Levering mulig</label><br/><label><input type="checkbox" checked={v.active} onChange={e=>set("active",e.target.checked)}/> Publisert</label>
 <div style={{display:"flex",gap:10,marginTop:18}}><button className="btn" disabled={saving||uploading}>{saving?"Lagrer …":"Lagre"}</button>{!isNew&&<button type="button" className="btn alt" onClick={()=>setEditing(false)}>Avbryt</button>}</div></form>;
}
function RentalCalendar({items,bookings,blocks}){
 const [month,setMonth]=useState(()=>new Date().toISOString().slice(0,7));
 const first=new Date(month+"-01T12:00:00"),year=first.getFullYear(),m=first.getMonth(),days=new Date(year,m+1,0).getDate(),offset=(new Date(year,m,1).getDay()+6)%7;
 const cells=[...Array(offset).fill(null),...Array.from({length:days},(_,i)=>i+1)];
 function iso(day){return month+"-"+String(day).padStart(2,"0")}
 function events(day){const d=iso(day),out=[];(bookings||[]).filter(b=>b.status!=="cancelled"&&b.startDate<=d&&b.endDate>=d).forEach(b=>out.push({kind:"booking",label:(b.itemName||"Utstyr")+" · "+(b.customer?.name||"Kunde")}));(blocks||[]).filter(b=>b.startDate<=d&&b.endDate>=d).forEach(b=>out.push({kind:"block",label:(items||[]).find(i=>i.id===b.itemId)?.name||"Blokkert"}));return out}
 function move(n){const d=new Date(year,m+n,1);setMonth(d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"))}
 return <div className="card rentalCalendar"><div className="calendarHead"><div><div className="kicker">UTLEIEKALENDER</div><h3>{first.toLocaleDateString("nb-NO",{month:"long",year:"numeric"})}</h3></div><div><button className="btn alt" onClick={()=>move(-1)}>←</button><button className="btn alt" onClick={()=>setMonth(new Date().toISOString().slice(0,7))}>I dag</button><button className="btn alt" onClick={()=>move(1)}>→</button></div></div>
 <div className="calendarGrid">{["Man","Tir","Ons","Tor","Fre","Lør","Søn"].map(x=><b className="calendarWeekday" key={x}>{x}</b>)}{cells.map((day,i)=>day?<div className="calendarDay" key={i}><strong>{day}</strong>{events(day).map((e,j)=><span className={"calendarEvent "+e.kind} key={j}>{e.label}</span>)}</div>:<div className="calendarDay empty" key={i}/>)}</div><p className="muted">Bookinger og manuelt blokkerte perioder vises samlet. Serviceperioder kan fortsatt legges inn under Utleieutstyr.</p></div>;
}

function RentalBookings({bookings,reload,setError,canUpdate}){
 const statuses={new:"Ny",confirmed:"Bekreftet",active:"Utlevert",returned:"Returnert",completed:"Ferdig",cancelled:"Avbrutt"};
 async function patch(id,changes){const r=await fetch("/api/admin/rental-bookings",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,...changes})});const d=await r.json().catch(()=>({}));if(!r.ok){setError(d.error||"Bookingen kunne ikke oppdateres.");return;}await reload();}
 if(!bookings.length)return <div className="card"><h3>Ingen utleiebookinger ennå</h3><p className="muted">Nye bookinger fra utleiesiden vises her.</p></div>;
 return <div className="grid">{bookings.map(b=><article className="card" key={b.id}><div className="kicker">{b.bookingNumber}</div><h3>{b.itemName}</h3><p><b>{b.customer?.name}</b><br/>{b.customer?.phone} · {b.customer?.email}<br/>{b.customer?.fulfillment==="delivery"?"Levering":"Henting"}{b.customer?.address?" · "+b.customer.address:""}</p><p>{b.startDate} – {b.endDate}<br/><b>{nok(b.totalOre)}</b> + depositum {nok(b.depositOre)}</p>
 <div className="field"><label>Status</label><select disabled={!canUpdate} value={b.status} onChange={e=>patch(b.id,{status:e.target.value})}>{Object.entries(statuses).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
 <div className="field"><label>Betaling</label><select disabled={!canUpdate} value={b.paymentStatus} onChange={e=>patch(b.id,{paymentStatus:e.target.value})}><option value="unpaid">Ikke betalt</option><option value="partial">Delvis betalt</option><option value="paid">Betalt</option><option value="refunded">Refundert</option></select></div>
 <div className="field"><label>Depositum</label><select disabled={!canUpdate} value={b.depositStatus} onChange={e=>patch(b.id,{depositStatus:e.target.value})}><option value="not_paid">Ikke mottatt</option><option value="held">Holdes</option><option value="released">Frigitt</option><option value="partially_charged">Delvis trukket</option><option value="charged">Trukket</option></select></div>
 <div className="field"><label>Internt notat</label><textarea defaultValue={b.adminNote} id={"rental-note-"+b.id}/></div>{canUpdate&&<button className="btn alt" onClick={()=>patch(b.id,{adminNote:document.getElementById("rental-note-"+b.id).value})}>Lagre notat</button>}
 </article>)}</div>;
}

const projectStoryMigrationSql="alter table public.projects add column if not exists content_blocks jsonb not null default '[]'::jsonb;";

function Projects({projects,reload,setError,storySetupRequired}){
 const [showNew,setShowNew]=useState(false);
 const [migrationCopied,setMigrationCopied]=useState(false);

 async function copyProjectMigration(){
  try{
   await navigator.clipboard.writeText(projectStoryMigrationSql);
   setMigrationCopied(true);
   window.setTimeout(()=>setMigrationCopied(false),1800);
  }catch{
   setError("Kunne ikke kopiere SQL automatisk. Åpne supabase/project_content_blocks.sql i prosjektet.");
  }
 }

 return <>
  {storySetupRequired&&<div className="adminProjectMigrationWarning">
   <b>Databaseoppdatering mangler</b>
   <span>Prosjektfortelling med tekst mellom bildene er ferdig programmert, men databasen må oppdateres før nye endringer kan lagres.</span>
   <code>{projectStoryMigrationSql}</code>
   <div className="adminProjectMigrationActions">
    <button type="button" className="btn alt" onClick={copyProjectMigration}>{migrationCopied?"Kopiert ✓":"Kopier SQL"}</button>
    <small>Kjør denne én gang i Supabase SQL Editor. Deretter oppdager backoffice automatisk at prosjektfortelling er klar.</small>
   </div>
  </div>}
  <div className="adminProjectToolbar">
   <div>
    <p className="muted">Legg inn ekte bilder fra utførte jobber. Første bilde brukes som hovedbilde. Under «Prosjektfortelling» kan du blande bilder og tekst i akkurat den rekkefølgen kunden skal se dem.</p>
   </div>
   <button className="btn" disabled={storySetupRequired} onClick={()=>setShowNew(!showNew)}>{showNew?"Avbryt":"Legg til oppdrag"}</button>
  </div>
  {showNew&&<ProjectEditor project={null} reload={reload} setError={setError} close={()=>setShowNew(false)}/>}
  <div className="grid adminProjectsGrid">{projects.map(p=><ProjectEditor key={p.id} project={p} reload={reload} setError={setError} storySetupRequired={storySetupRequired}/>)}</div>
 </>;
}

function projectBlockId(){
 return "block-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,8);
}

function defaultProjectBlocks(project){
 if(Array.isArray(project?.contentBlocks)&&project.contentBlocks.length)return project.contentBlocks;
 return (Array.isArray(project?.imageUrls)?project.imageUrls:[]).map(url=>({id:projectBlockId(),type:"image",url,caption:"",alt:""}));
}

function ProjectEditor({project,reload,setError,close,storySetupRequired=false}){
 const isNew=!project;
 const [editing,setEditing]=useState(isNew);
 const [saving,setSaving]=useState(false);
 const [uploading,setUploading]=useState(false);
 const [previewing,setPreviewing]=useState(false);
 const [v,setV]=useState({
  title:project?.title||"",
  category:project?.category||"",
  description:project?.description||"",
  imageUrls:Array.isArray(project?.imageUrls)?project.imageUrls:[],
  contentBlocks:defaultProjectBlocks(project),
  featured:project?.featured!==false,
  active:project?.active!==false,
  sortOrder:project?.sortOrder||0
 });

 useEffect(()=>{
  if(!project)return;
  setV({
   title:project.title||"",
   category:project.category||"",
   description:project.description||"",
   imageUrls:Array.isArray(project.imageUrls)?project.imageUrls:[],
   contentBlocks:defaultProjectBlocks(project),
   featured:project.featured!==false,
   active:project.active!==false,
   sortOrder:project.sortOrder||0
  });
 },[project]);

 const set=(k,x)=>setV(current=>({...current,[k]:x}));

 async function upload(files){
  const picked=Array.from(files||[]);
  if(!picked.length)return;
  const room=Math.max(0,30-v.imageUrls.length);
  const selected=picked.slice(0,room);
  if(!selected.length){setError("Du kan ha maks 30 bilder per oppdrag.");return;}

  setUploading(true);
  setError("");
  const urls=[];

  for(const file of selected){
   const fd=new FormData();
   fd.append("file",file);
   const r=await fetch("/api/admin/upload",{method:"POST",body:fd});
   const d=await r.json().catch(()=>({}));
   if(r.ok&&d.url)urls.push(d.url);
   else{
    setUploading(false);
    setError(d.error||"Et bilde kunne ikke lastes opp.");
    return;
   }
  }

  setV(current=>({
   ...current,
   imageUrls:[...current.imageUrls,...urls].slice(0,30),
   contentBlocks:[
    ...current.contentBlocks,
    ...urls.map(url=>({id:projectBlockId(),type:"image",url,caption:"",alt:""}))
   ].slice(0,80)
  }));

  if(picked.length>room)setError("De første "+room+" bildene ble lagt til. Maks 30 bilder per oppdrag.");
  setUploading(false);
 }

 function moveImage(index,direction){
  setV(current=>{
   const next=[...current.imageUrls];
   const target=index+direction;
   if(target<0||target>=next.length)return current;
   [next[index],next[target]]=[next[target],next[index]];
   return {...current,imageUrls:next};
  });
 }

 function makeCover(index){
  setV(current=>{
   const next=[...current.imageUrls];
   const [chosen]=next.splice(index,1);
   next.unshift(chosen);
   return {...current,imageUrls:next};
  });
 }

 function removeImage(url,index){
  setV(current=>({
   ...current,
   imageUrls:current.imageUrls.filter((_,imageIndex)=>imageIndex!==index),
   contentBlocks:current.contentBlocks.filter(block=>!(block.type==="image"&&block.url===url))
  }));
 }

 function addTextBlock(afterIndex=null,preset=null){
  setV(current=>{
   const block={
    id:projectBlockId(),
    type:"text",
    eyebrow:preset?.eyebrow||"",
    title:preset?.title||"",
    body:preset?.body||""
   };
   if(afterIndex===null){
    return {...current,contentBlocks:[...current.contentBlocks,block].slice(0,80)};
   }
   const next=[...current.contentBlocks];
   next.splice(afterIndex+1,0,block);
   return {...current,contentBlocks:next.slice(0,80)};
  });
 }

 function addStoryPreset(kind){
  const presets={
   before:{eyebrow:"FØR ARBEIDET",title:"Utgangspunktet",body:""},
   during:{eyebrow:"UNDER ARBEIDET",title:"Slik løste vi oppgaven",body:""},
   after:{eyebrow:"FERDIG RESULTAT",title:"Resultatet",body:""}
  };
  addTextBlock(null,presets[kind]);
 }

 function syncImagesToStory(){
  setV(current=>{
   const used=new Set(current.contentBlocks.filter(block=>block.type==="image").map(block=>block.url));
   const missing=current.imageUrls.filter(url=>!used.has(url));
   return {
    ...current,
    contentBlocks:[
     ...current.contentBlocks,
     ...missing.map(url=>({id:projectBlockId(),type:"image",url,caption:"",alt:""}))
    ].slice(0,80)
   };
  });
 }

 function moveContentBlock(index,direction){
  setV(current=>{
   const next=[...current.contentBlocks];
   const target=index+direction;
   if(target<0||target>=next.length)return current;
   [next[index],next[target]]=[next[target],next[index]];
   return {...current,contentBlocks:next};
  });
 }

 function updateContentBlock(index,patch){
  setV(current=>({
   ...current,
   contentBlocks:current.contentBlocks.map((block,blockIndex)=>blockIndex===index?{...block,...patch}:block)
  }));
 }

 function removeContentBlock(index){
  setV(current=>({
   ...current,
   contentBlocks:current.contentBlocks.filter((_,blockIndex)=>blockIndex!==index)
  }));
 }

 async function save(e){
  e.preventDefault();
  setSaving(true);
  setError("");
  const r=await fetch("/api/admin/projects",{
   method:isNew?"POST":"PATCH",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({...v,...(!isNew?{id:project.id}:{})})
  });
  const d=await r.json().catch(()=>({}));
  setSaving(false);
  if(!r.ok){
   setError(d.setupRequired
    ? "Databaseoppdatering mangler for prosjektfortelling. Kjør prosjektmigreringen før du lagrer denne funksjonen."
    : (d.error||"Oppdraget kunne ikke lagres."));
   return;
  }
  if(close)close();else setEditing(false);
  await reload();
 }

 useEffect(()=>{
  if(!previewing)return;
  const previousOverflow=document.body.style.overflow;
  document.body.style.overflow="hidden";
  function onKeyDown(event){
   if(event.key==="Escape")setPreviewing(false);
  }
  window.addEventListener("keydown",onKeyDown);
  return()=>{
   window.removeEventListener("keydown",onKeyDown);
   document.body.style.overflow=previousOverflow;
  };
 },[previewing]);

 const previewSections=[];
 let previewImages=[];
 v.contentBlocks.forEach((block,index)=>{
  if(block.type==="image"){
   previewImages.push({...block,_index:index});
   return;
  }
  if(previewImages.length){
   previewSections.push({type:"images",id:"preview-images-"+index,items:previewImages});
   previewImages=[];
  }
  previewSections.push({...block,_index:index});
 });
 if(previewImages.length)previewSections.push({type:"images",id:"preview-images-end",items:previewImages});

 async function remove(){
  if(!project?.id||!window.confirm('Slette "'+project.title+'"?'))return;
  const r=await fetch("/api/admin/projects",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:project.id})});
  if(!r.ok){setError("Oppdraget kunne ikke slettes.");return;}
  await reload();
 }

 if(!editing&&project)return <article className="card adminProjectCard">
  {project.imageUrls?.[0]?<img className="adminProjectCover" src={project.imageUrls[0]} alt=""/>:<div className="adminProjectCoverPlaceholder">Ingen bilder ennå</div>}
  <div className="adminProjectSummary">
   <div className="kicker">{project.category||"OPPDRAG"}</div>
   <h3>{project.title}</h3>
   {project.description&&<p>{project.description}</p>}
   <p className="muted">{project.imageUrls?.length||0} {project.imageUrls?.length===1?"bilde":"bilder"} · {project.contentBlocks?.filter(block=>block.type==="text").length||0} tekstseksjoner · {project.active?"Publisert":"Skjult"} · {project.featured?"Vises på forsiden":"Ikke på forsiden"}</p>
   <div className="adminProjectActions">
    <button className="btn" disabled={storySetupRequired} onClick={()=>setEditing(true)}>Rediger</button>
    {project.active&&project.slug&&<a className="btn alt" href={"/prosjekter/"+project.slug} target="_blank" rel="noreferrer">Se offentlig side</a>}
    <button className="btn alt" onClick={remove}>Slett</button>
   </div>
  </div>
 </article>;

 return <form className="card adminProjectEditor" onSubmit={save}>
  <div className="kicker">{isNew?"NYTT OPPDRAG":"REDIGER OPPDRAG"}</div>
  <h3>{isNew?"Nytt referanseprosjekt":v.title||"Oppdrag"}</h3>

  <div className="field"><label>Tittel</label><input required value={v.title} onChange={e=>set("title",e.target.value)} placeholder="F.eks. Terrasse og levegg"/></div>
  <div className="field"><label>Kategori</label><input value={v.category} onChange={e=>set("category",e.target.value)} placeholder="F.eks. Uteområde"/></div>
  <div className="field"><label>Kort introduksjon</label><textarea rows="4" value={v.description} onChange={e=>set("description",e.target.value)} placeholder="Kort tekst som vises på prosjektkortet og øverst på prosjektsiden."/></div>

  <div className="field adminProjectImagesField">
   <div className="adminProjectImagesHeader">
    <label>Bilder</label>
    <span>{v.imageUrls.length} / 30</span>
   </div>
   <p className="muted adminProjectImageHelp">Første bilde er hovedbildet på forsiden og i prosjektoversikten. Bildene du laster opp blir også lagt til nederst i prosjektfortellingen automatisk.</p>

   {v.imageUrls.length>0&&<div className="adminProjectImageGrid">
    {v.imageUrls.map((url,i)=><div key={url+i} className={"adminProjectImageItem "+(i===0?"isCover":"")}>
     <div className="adminProjectImageThumb">
      <img src={url} alt={"Prosjektbilde "+(i+1)}/>
      {i===0&&<span>Hovedbilde</span>}
      <b>{i+1}</b>
     </div>
     <div className="adminProjectImageActions">
      <button type="button" className="btn alt" disabled={i===0} onClick={()=>moveImage(i,-1)} aria-label="Flytt bilde til venstre">←</button>
      <button type="button" className="btn alt" disabled={i===v.imageUrls.length-1} onClick={()=>moveImage(i,1)} aria-label="Flytt bilde til høyre">→</button>
      {i!==0&&<button type="button" className="btn alt" onClick={()=>makeCover(i)}>Hoved</button>}
      <button type="button" className="btn alt" onClick={()=>removeImage(url,i)}>Fjern</button>
     </div>
    </div>)}
   </div>}

   <label className="adminProjectUpload">
    <input type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={uploading||v.imageUrls.length>=30} onChange={e=>{upload(e.target.files);e.target.value=""}}/>
    <span>{uploading?"Laster opp bilder …":v.imageUrls.length>=30?"Maks 30 bilder":"Velg bilder"}</span>
    <small>JPG, PNG eller WebP. Du kan velge flere bilder samtidig.</small>
   </label>
  </div>

  <section className="adminProjectStory">
   <div className="adminProjectStoryInfo">
    <b>Slik vises prosjektet for kunden</b>
    <span>Forsiden bruker hovedbildet. Prosjektsiden følger rekkefølgen under, og tekstseksjonene deler bildene inn i tydelige deler.</span>
   </div>
   <div className="adminProjectStoryHead">
    <div>
     <div className="kicker">PROSJEKTFORTELLING</div>
     <h4>Bygg siden med bilder og tekst</h4>
     <p className="muted">Flytt blokkene opp og ned. Tekstblokker kan ligge mellom akkurat de bildene du ønsker.</p>
    </div>
    <div className="adminProjectStoryActions">
     <button type="button" className="btn" onClick={()=>addTextBlock()}>+ Tom tekstseksjon</button>
     <button type="button" className="btn alt" onClick={syncImagesToStory}>Legg inn manglende bilder</button>
     <button type="button" className="btn alt" disabled={!v.contentBlocks.length} onClick={()=>setPreviewing(true)}>Forhåndsvis</button>
    </div>
   </div>
   <div className="adminProjectStoryPresets">
    <span>Hurtigseksjoner:</span>
    <button type="button" onClick={()=>addStoryPreset("before")}>+ Før arbeidet</button>
    <button type="button" onClick={()=>addStoryPreset("during")}>+ Under arbeidet</button>
    <button type="button" onClick={()=>addStoryPreset("after")}>+ Ferdig resultat</button>
   </div>

   <div className="adminProjectStoryDivider">
    <span>Rekkefølge på kundesiden</span>
   </div>

   {v.contentBlocks.length===0?<div className="adminProjectStoryEmpty">Ingen blokker ennå. Last opp bilder eller legg til en tekstseksjon.</div>:<div className="adminProjectStoryList">
    {v.contentBlocks.map((block,index)=><div className={"adminProjectStoryBlock "+(block.type==="text"?"isText":"isImage")} key={block.id||index}>
     <div className="adminProjectStoryOrder">
      <span>{String(index+1).padStart(2,"0")}</span>
      <button type="button" disabled={index===0} onClick={()=>moveContentBlock(index,-1)} aria-label="Flytt blokk opp">↑</button>
      <button type="button" disabled={index===v.contentBlocks.length-1} onClick={()=>moveContentBlock(index,1)} aria-label="Flytt blokk ned">↓</button>
     </div>

     {block.type==="image"?<div className="adminProjectStoryImage">
      <img src={block.url} alt={block.alt||""}/>
      <div className="adminProjectStoryImageFields">
       <b>Bilde</b>
       <small>Vises i denne posisjonen på prosjektsiden.</small>
       <div className="field"><label>Bildetekst <span>(valgfritt)</span></label><input value={block.caption||""} onChange={e=>updateContentBlock(index,{caption:e.target.value})} placeholder="F.eks. Ny levegg og ferdig terrasse"/></div>
       <div className="field"><label>Alternativ tekst <span>(valgfritt)</span></label><input value={block.alt||""} onChange={e=>updateContentBlock(index,{alt:e.target.value})} placeholder="Kort beskrivelse av bildet for tilgjengelighet"/></div>
      </div>
     </div>:<div className="adminProjectStoryText">
      <div className="field"><label>Liten gulltekst</label><input value={block.eyebrow||""} onChange={e=>updateContentBlock(index,{eyebrow:e.target.value})} placeholder="F.eks. FØR ARBEIDET"/></div>
      <div className="field"><label>Overskrift</label><input value={block.title||""} onChange={e=>updateContentBlock(index,{title:e.target.value})} placeholder="Hva gjorde vi her?"/></div>
      <div className="field"><label>Tekst</label><textarea rows="4" value={block.body||""} onChange={e=>updateContentBlock(index,{body:e.target.value})} placeholder="Fortell kort om denne delen av arbeidet."/></div>
     </div>}

     <div className="adminProjectStoryBlockActions">
      <button type="button" className="adminProjectStoryInsert" onClick={()=>addTextBlock(index)}>+ Tekst under</button>
      <button type="button" className="adminProjectStoryRemove" onClick={()=>removeContentBlock(index)}>{block.type==="text"?"Fjern tekstseksjon":"Fjern fra fortellingen"}</button>
     </div>
    </div>)}
   </div>}
  </section>

  {previewing&&<div className="adminProjectPreview" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setPreviewing(false)}}>
   <div className="adminProjectPreviewPanel" role="dialog" aria-modal="true" aria-label="Forhåndsvis prosjektfortelling">
    <div className="adminProjectPreviewTop">
     <div><span className="kicker">FORHÅNDSVISNING</span><h3>{v.title||"Prosjekt"}</h3></div>
     <button type="button" className="adminProjectPreviewClose" onClick={()=>setPreviewing(false)} aria-label="Lukk forhåndsvisning">×</button>
    </div>
    {v.description&&<p className="adminProjectPreviewLead">{v.description}</p>}
    <div className="adminProjectPreviewStory">
     {previewSections.map((section,index)=>section.type==="text"?<section className="adminProjectPreviewText" key={section.id||index}>
      {section.eyebrow&&<span>{section.eyebrow}</span>}
      {section.title&&<h4>{section.title}</h4>}
      {section.body&&<p>{section.body}</p>}
     </section>:<div className={"adminProjectPreviewImages "+(section.items.length===1?"single":"")} key={section.id||index}>
      {section.items.map((block,imageIndex)=><figure key={block.id||block.url||imageIndex}><img src={block.url} alt={block.alt||""}/>{block.caption&&<figcaption>{block.caption}</figcaption>}</figure>)}
     </div>)}
    </div>
   </div>
  </div>}

  <div className="field"><label>Sortering</label><input type="number" value={v.sortOrder} onChange={e=>set("sortOrder",e.target.value)}/></div>
  <div className="adminProjectToggles">
   <label><input type="checkbox" checked={v.featured} onChange={e=>set("featured",e.target.checked)}/> Vis på forsiden</label>
   <label><input type="checkbox" checked={v.active} onChange={e=>set("active",e.target.checked)}/> Publisert</label>
  </div>

  <div className="adminProjectActions">
   <button className="btn" disabled={saving||uploading}>{saving?"Lagrer …":uploading?"Laster opp …":"Lagre"}</button>
   {!isNew&&<button type="button" className="btn alt" onClick={()=>setEditing(false)}>Avbryt</button>}
  </div>
 </form>;
}

function HomepageManager({services,projects,settings,reload,setTab,setError}){
 const defaults={heroEyebrow:"BYGG · RENOVERING · UTEOMRÅDER · VEDLIKEHOLD",heroTitle:"Kvalitet som varer.",seasonalTitle:"",seasonalText:"",seasonalCtaLabel:"",seasonalCtaHref:"",seasonalFrom:null,seasonalUntil:null,showSeasonal:false,heroText:"Aadland Service leverer solide løsninger innen bygg, oppussing, vedlikehold og uteområder. Vi kombinerer fagkunnskap, nøyaktighet og god oppfølging – tilpasset dine behov.",aboutTitle:"Lokalt håndverk med stolthet.",aboutText:"Vi hjelper med oppussing, vedlikehold, uteområder og spesialtilpassede løsninger. Målet er enkelt: ryddig kommunikasjon, praktiske valg og et resultat du kan være fornøyd med.",phone:"471 54 898",email:"post@aadland-service.no",orgNumber:"937 781 873 MVA",location:"Bergen og omegn",showServices:true,showProjects:true,showAbout:true,showSurvey:true};
 const [v,setV]=useState(settings||defaults),[saving,setSaving]=useState(false);
 useEffect(()=>{setV(settings||defaults)},[settings]);
 const set=(k,x)=>setV(old=>({...old,[k]:x}));
 async function save(e){e.preventDefault();setSaving(true);setError("");const r=await fetch("/api/admin/site-settings",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(v)}),d=await r.json().catch(()=>({}));setSaving(false);if(!r.ok){setError(d.error||"Forsiden kunne ikke lagres.");return;}await reload();}
 const visibleServices=(services||[]).filter(s=>s.active!==false&&s.showOnHome!==false),featuredProjects=(projects||[]).filter(p=>p.active!==false&&p.featured!==false);
 return <><form className="card homepageSettings" onSubmit={save}><div className="kicker">FORSIDEN</div><h3>Innhold og kontaktinformasjon</h3>
 <div className="field"><label>Liten tekst over hovedoverskrift</label><input value={v.heroEyebrow||""} onChange={e=>set("heroEyebrow",e.target.value)}/></div>
 <div className="field"><label>Hovedoverskrift</label><input value={v.heroTitle||""} onChange={e=>set("heroTitle",e.target.value)}/></div>
 <div className="field"><label>Tekst i toppen</label><textarea rows="4" value={v.heroText||""} onChange={e=>set("heroText",e.target.value)}/></div>
 <fieldset className="seasonalAdmin"><legend>Aktuelt / sesonginnhold</legend><label><input type="checkbox" checked={v.showSeasonal===true} onChange={e=>set("showSeasonal",e.target.checked)}/> Vis aktuelt-felt på forsiden</label><div className="field"><label>Overskrift</label><input value={v.seasonalTitle||""} onChange={e=>set("seasonalTitle",e.target.value)} placeholder="F.eks. Bestill snørydding før vinteren"/></div><div className="field"><label>Tekst</label><textarea rows="3" value={v.seasonalText||""} onChange={e=>set("seasonalText",e.target.value)}/></div><div className="formTwo"><div className="field"><label>Fra dato</label><input type="date" value={v.seasonalFrom||""} onChange={e=>set("seasonalFrom",e.target.value)}/></div><div className="field"><label>Til dato</label><input type="date" value={v.seasonalUntil||""} onChange={e=>set("seasonalUntil",e.target.value)}/></div></div><div className="formTwo"><div className="field"><label>Knappetekst</label><input value={v.seasonalCtaLabel||""} onChange={e=>set("seasonalCtaLabel",e.target.value)}/></div><div className="field"><label>Knappelenke</label><input value={v.seasonalCtaHref||""} onChange={e=>set("seasonalCtaHref",e.target.value)} placeholder="#befaring"/></div></div></fieldset>
 <div className="field"><label>Overskrift Om oss</label><input value={v.aboutTitle||""} onChange={e=>set("aboutTitle",e.target.value)}/></div>
 <div className="field"><label>Tekst Om oss</label><textarea rows="4" value={v.aboutText||""} onChange={e=>set("aboutText",e.target.value)}/></div>
 <div className="formTwo"><div className="field"><label>Telefon</label><input value={v.phone||""} onChange={e=>set("phone",e.target.value)}/></div><div className="field"><label>E-post</label><input type="email" value={v.email||""} onChange={e=>set("email",e.target.value)}/></div></div>
 <div className="formTwo"><div className="field"><label>Organisasjonsnummer</label><input value={v.orgNumber||""} onChange={e=>set("orgNumber",e.target.value)}/></div><div className="field"><label>Område</label><input value={v.location||""} onChange={e=>set("location",e.target.value)}/></div></div>
 <div className="homepageToggles"><label><input type="checkbox" checked={v.showServices!==false} onChange={e=>set("showServices",e.target.checked)}/> Vis tjenester</label><label><input type="checkbox" checked={v.showProjects!==false} onChange={e=>set("showProjects",e.target.checked)}/> Vis tidligere oppdrag</label><label><input type="checkbox" checked={v.showAbout!==false} onChange={e=>set("showAbout",e.target.checked)}/> Vis Om oss</label><label><input type="checkbox" checked={v.showSurvey!==false} onChange={e=>set("showSurvey",e.target.checked)}/> Vis befaring/kontakt</label></div>
 <button className="btn" disabled={saving}>{saving?"Lagrer …":"Lagre forside"}</button></form>
 <div className="grid homepageQuick"><article className="card"><h3>Tjenester</h3><p className="muted">{visibleServices.length} vises på forsiden.</p><button className="btn alt" onClick={()=>setTab("services")}>Administrer tjenester</button></article><article className="card"><h3>Tidligere oppdrag</h3><p className="muted">{featuredProjects.length} er valgt for forsiden.</p><button className="btn alt" onClick={()=>setTab("projects")}>Administrer oppdrag</button></article></div></>;
}
