import { NextResponse } from "next/server";
import {
  getAdminUser,
  hasPermission,
} from "../../../../lib/auth";
import { db, fromDbProduct } from "../../../../lib/supabase";

export async function GET() {
  const currentUser = await getAdminUser();

  if (!currentUser) {
    return NextResponse.json(
      { error: "Ikke innlogget." },
      { status: 401 }
    );
  }

  if (!(await hasPermission("canManageProducts"))) {
    return NextResponse.json(
      { error: "Du har ikke tilgang til produkter." },
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
    .from("products")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("ADMIN PRODUCTS GET ERROR:", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });

    return NextResponse.json(
      {
        error: `Produktene kunne ikke hentes: ${
          error.message || "Ukjent databasefeil"
        }`,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    products: (data || []).map(fromDbProduct),
  });
}

export async function PATCH(req) {
  const currentUser = await getAdminUser();

  if (!currentUser) {
    return NextResponse.json(
      { error: "Ikke innlogget." },
      { status: 401 }
    );
  }

  if (!(await hasPermission("canManageProducts"))) {
    return NextResponse.json(
      { error: "Du har ikke tilgang til å administrere produkter." },
      { status: 403 }
    );
  }

  const p = await req.json();

  if (!p.id) {
    return NextResponse.json(
      { error: "Produkt mangler." },
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

  const { error } = await s
    .from("products")
    .update({
      name: p.name,
      category: p.category,
      description: p.description,
      base_price_ore: p.basePriceOre,
      image_url: p.imageUrl || null,
      active: p.active,
    })
    .eq("id", p.id);

  if (error) {
    console.error("ADMIN PRODUCT UPDATE ERROR:", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });

    return NextResponse.json(
      {
        error: `Produktet kunne ikke lagres: ${
          error.message || "Ukjent databasefeil"
        }`,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}

export async function POST(req) {
  const currentUser = await getAdminUser();

  if (!currentUser) {
    return NextResponse.json(
      { error: "Ikke innlogget." },
      { status: 401 }
    );
  }

  if (!(await hasPermission("canManageProducts"))) {
    return NextResponse.json(
      { error: "Du har ikke tilgang til å opprette produkter." },
      { status: 403 }
    );
  }

  const p = await req.json();

  if (!p.name) {
    return NextResponse.json(
      { error: "Produktnavn mangler." },
      { status: 400 }
    );
  }

  const id =
    p.name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") +
    "-" +
    Date.now().toString().slice(-4);

  const s = db();

  if (!s) {
    return NextResponse.json(
      { error: "Databasen er ikke tilgjengelig." },
      { status: 500 }
    );
  }

  const { error } = await s.from("products").insert({
    id,
    slug: id,
    name: p.name,
    category: p.category || "På bestilling",
    description: p.description || "",
    base_price_ore: Number(p.basePriceOre) || 0,
    options: [],
    image_url: p.imageUrl || null,
    active: true,
  });

  if (error) {
    console.error("ADMIN PRODUCT CREATE ERROR:", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });

    return NextResponse.json(
      {
        error: `Produktet kunne ikke opprettes: ${
          error.message || "Ukjent databasefeil"
        }`,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
