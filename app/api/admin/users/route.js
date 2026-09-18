import { NextResponse } from "next/server";
import {
  getAdminUser,
  hasPermission,
} from "../../../../lib/auth";
import { db } from "../../../../lib/supabase";

export async function GET() {
  const currentUser = await getAdminUser();

  if (!currentUser) {
    return NextResponse.json(
      { error: "Ikke innlogget." },
      { status: 401 }
    );
  }

  if (!(await hasPermission("canManageUsers"))) {
    return NextResponse.json(
      { error: "Du har ikke tilgang til brukeradministrasjon." },
      { status: 403 }
    );
  }

  const s = db();

  if (!s) {
    return NextResponse.json(
      { error: "Databasen er ikke tilgjengelig." },
      { status: 500 }
    );
  }

  const { data, error } = await s
    .from("admin_users")
    .select(
      "id,email,name,role,can_view_orders,can_update_orders,can_manage_products,can_manage_users,active,created_at"
    )
    .order("created_at", { ascending: true });

  if (error) {
    console.error("ADMIN USERS GET ERROR:", error);

    return NextResponse.json(
      {
        error: `Brukerne kunne ikke hentes: ${
          error.message || "Ukjent databasefeil"
        }`,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    users: data || [],
    currentUserId: currentUser.id,
  });
}

export async function POST(req) {
  const currentUser = await getAdminUser();

  if (!currentUser) {
    return NextResponse.json(
      { error: "Ikke innlogget." },
      { status: 401 }
    );
  }

  if (!(await hasPermission("canManageUsers"))) {
    return NextResponse.json(
      { error: "Du har ikke tilgang til å opprette brukere." },
      { status: 403 }
    );
  }

  const body = await req.json();

  const email = String(body.email || "")
    .trim()
    .toLowerCase();

  const name = String(body.name || "").trim();
  const password = String(body.password || "");

  if (!email || !name || !password) {
    return NextResponse.json(
      { error: "Fyll inn navn, e-post og passord." },
      { status: 400 }
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: "Passordet må være minst 8 tegn." },
      { status: 400 }
    );
  }

  const s = db();

  if (!s) {
    return NextResponse.json(
      { error: "Databasen er ikke tilgjengelig." },
      { status: 500 }
    );
  }

  const { data: authData, error: authError } =
    await s.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (authError || !authData.user) {
    console.error(
      "AUTH CREATE USER ERROR:",
      authError
    );

    return NextResponse.json(
      {
        error:
          authError?.message ||
          "Innloggingsbrukeren kunne ikke opprettes.",
      },
      { status: 400 }
    );
  }

  const record = {
    id: authData.user.id,
    email,
    name,
    role: "user",
    can_view_orders: Boolean(body.canViewOrders),
    can_update_orders: Boolean(body.canUpdateOrders),
    can_manage_products: Boolean(
      body.canManageProducts
    ),
    can_manage_users: Boolean(body.canManageUsers),
    active: true,
  };

  const { error: profileError } = await s
    .from("admin_users")
    .insert(record);

  if (profileError) {
    console.error(
      "ADMIN USER PROFILE INSERT ERROR:",
      profileError
    );

    await s.auth.admin.deleteUser(
      authData.user.id
    );

    return NextResponse.json(
      {
        error: `Brukerprofil kunne ikke opprettes: ${
          profileError.message ||
          "Ukjent databasefeil"
        }`,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(req) {
  const currentUser = await getAdminUser();

  if (!currentUser) {
    return NextResponse.json(
      { error: "Ikke innlogget." },
      { status: 401 }
    );
  }

  if (!(await hasPermission("canManageUsers"))) {
    return NextResponse.json(
      { error: "Du har ikke tilgang til å endre brukere." },
      { status: 403 }
    );
  }

  const body = await req.json();

  if (!body.id) {
    return NextResponse.json(
      { error: "Bruker mangler." },
      { status: 400 }
    );
  }

  const s = db();

  if (!s) {
    return NextResponse.json(
      { error: "Databasen er ikke tilgjengelig." },
      { status: 500 }
    );
  }

  /*
   * Hent brukeren som forsøkes endret.
   * Dette gjøres på serveren slik at beskyttelsen
   * ikke kan omgås ved å sende API-kall manuelt.
   */
  const {
    data: targetUser,
    error: targetError,
  } = await s
    .from("admin_users")
    .select("id,role,active")
    .eq("id", body.id)
    .single();

  if (targetError || !targetUser) {
    return NextResponse.json(
      { error: "Brukeren finnes ikke." },
      { status: 404 }
    );
  }

  /*
   * Eierkontoen kan ikke endres gjennom
   * vanlig brukeradministrasjon.
   */
  if (targetUser.role === "owner") {
    return NextResponse.json(
      {
        error:
          "Eierkontoen er beskyttet og kan ikke endres her.",
      },
      { status: 403 }
    );
  }

  /*
   * Ingen kan deaktivere sin egen konto.
   */
  if (
    body.id === currentUser.id &&
    body.active === false
  ) {
    return NextResponse.json(
      {
        error:
          "Du kan ikke deaktivere din egen bruker.",
      },
      { status: 400 }
    );
  }

  const update = {
    name: String(body.name || "").trim(),
    can_view_orders: Boolean(
      body.canViewOrders
    ),
    can_update_orders: Boolean(
      body.canUpdateOrders
    ),
    can_manage_products: Boolean(
      body.canManageProducts
    ),
    can_manage_users: Boolean(
      body.canManageUsers
    ),
    active: body.active !== false,
  };

  const { error } = await s
    .from("admin_users")
    .update(update)
    .eq("id", body.id);

  if (error) {
    console.error(
      "ADMIN USER UPDATE ERROR:",
      error
    );

    return NextResponse.json(
      {
        error: `Brukeren kunne ikke oppdateres: ${
          error.message ||
          "Ukjent databasefeil"
        }`,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
