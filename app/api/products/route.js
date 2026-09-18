import { NextResponse } from "next/server";
import {
  getAdminUser,
  hasPermission,
} from "../../../../lib/auth";
import {
  db,
  fromDbProduct,
} from "../../../../lib/supabase";

async function requireProductAccess() {
  const currentUser = await getAdminUser();

  if (!currentUser) {
    return {
      error: NextResponse.json(
        { error: "Ikke innlogget." },
        { status: 401 }
      ),
    };
  }

  if (!(await hasPermission("canManageProducts"))) {
    return {
      error: NextResponse.json(
        {
          error:
            "Du har ikke tilgang til å administrere produkter.",
        },
        { status: 403 }
      ),
    };
  }

  return { currentUser };
}

function cleanText(value) {
  return String(value || "").trim();
}

function validPrice(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0;
}

function cleanArray(value) {
  return Array.isArray(value) ? value : [];
}

export async function GET() {
  const access = await requireProductAccess();
  if (access.error) return access.error;

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
    console.error("ADMIN PRODUCTS GET ERROR:", error);

    return NextResponse.json(
      { error: "Produktene kunne ikke hentes." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    products: (data || []).map(fromDbProduct),
  });
}

export async function PATCH(req) {
  const access = await requireProductAccess();
  if (access.error) return access.error;

  const p = await req.json();

  if (!p.id) {
    return NextResponse.json(
      { error: "Produkt mangler." },
      { status: 400 }
    );
  }

  const name = cleanText(p.name);
  const category =
    cleanText(p.category) || "På bestilling";
  const description = cleanText(p.description);
  const dimensions = cleanText(p.dimensions);

  const imageUrls = cleanArray(p.imageUrls)
    .map(cleanText)
    .filter(Boolean);

  const imageUrl =
    imageUrls[0] ||
    cleanText(p.imageUrl) ||
    null;

  const specifications = cleanArray(
    p.specifications
  );

  const options = cleanArray(p.options);

  if (!name) {
    return NextResponse.json(
      { error: "Produktet må ha et navn." },
      { status: 400 }
    );
  }

  if (!validPrice(p.basePriceOre)) {
    return NextResponse.json(
      { error: "Produktet må ha en gyldig pris." },
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

  const { data, error } = await s
    .from("products")
    .update({
      name,
      category,
      description,
      dimensions,
      base_price_ore: Math.round(
        Number(p.basePriceOre)
      ),
      image_url: imageUrl,
      image_urls: imageUrls,
      specifications,
      options,
      active: p.active !== false,
    })
    .eq("id", p.id)
    .select("*")
    .single();

  if (error) {
    console.error(
      "ADMIN PRODUCT UPDATE ERROR:",
      error
    );

    return NextResponse.json(
      { error: "Produktet kunne ikke lagres." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    product: fromDbProduct(data),
  });
}

export async function POST(req) {
  const access = await requireProductAccess();
  if (access.error) return access.error;

  const p = await req.json();

  const name = cleanText(p.name);
  const category =
    cleanText(p.category) || "På bestilling";
  const description = cleanText(p.description);
  const dimensions = cleanText(p.dimensions);

  const imageUrls = cleanArray(p.imageUrls)
    .map(cleanText)
    .filter(Boolean);

  const imageUrl =
    imageUrls[0] ||
    cleanText(p.imageUrl) ||
    null;

  const specifications = cleanArray(
    p.specifications
  );

  const options = cleanArray(p.options);

  if (!name) {
    return NextResponse.json(
      { error: "Produktnavn mangler." },
      { status: 400 }
    );
  }

  if (!validPrice(p.basePriceOre)) {
    return NextResponse.json(
      { error: "Produktet må ha en gyldig pris." },
      { status: 400 }
    );
  }

  const slugBase =
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") ||
    "produkt";

  const id = `${slugBase}-${Date.now()}`;

  const s = db();

  if (!s) {
    return NextResponse.json(
      { error: "Databasen er ikke tilgjengelig." },
      { status: 500 }
    );
  }

  const { data, error } = await s
    .from("products")
    .insert({
      id,
      slug: id,
      name,
      category,
      description,
      dimensions,
      base_price_ore: Math.round(
        Number(p.basePriceOre)
      ),
      options,
      image_url: imageUrl,
      image_urls: imageUrls,
      specifications,
      active: p.active !== false,
    })
    .select("*")
    .single();

  if (error) {
    console.error(
      "ADMIN PRODUCT CREATE ERROR:",
      error
    );

    return NextResponse.json(
      { error: "Produktet kunne ikke opprettes." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    product: fromDbProduct(data),
  });
}
