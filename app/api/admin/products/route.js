import { NextResponse } from "next/server";
import { db, fromDbProduct } from "../../../../lib/supabase";
import { hasPermission } from "../../../../lib/auth";

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

function makeSlug(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function getCategory(s, categoryId) {
  const id = cleanText(categoryId);

  if (!id) {
    return null;
  }

  const { data, error } = await s
    .from("categories")
    .select("id,name")
    .eq("id", id)
    .single();

  if (error || !data) {
    return null;
  }

  return data;
}

export async function GET() {
  try {
    if (!(await hasPermission("canManageProducts"))) {
      return NextResponse.json(
        { error: "Du har ikke tilgang til å administrere produkter." },
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
      console.error("ADMIN PRODUCTS GET ERROR:", error);

      return NextResponse.json(
        { error: "Produktene kunne ikke hentes." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      products: (data || []).map(fromDbProduct),
    });
  } catch (error) {
    console.error("ADMIN PRODUCTS GET ERROR:", error);

    return NextResponse.json(
      { error: "Produktene kunne ikke hentes." },
      { status: 500 }
    );
  }
}

export async function POST(req) {
  try {
    if (!(await hasPermission("canManageProducts"))) {
      return NextResponse.json(
        { error: "Du har ikke tilgang til å administrere produkter." },
        { status: 403 }
      );
    }

    const body = await req.json();

    const name = cleanText(body.name);

    if (!name) {
      return NextResponse.json(
        { error: "Produktet må ha et navn." },
        { status: 400 }
      );
    }

    if (!validPrice(body.basePriceOre)) {
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

    const category = await getCategory(
      s,
      body.categoryId
    );

    if (!category) {
      return NextResponse.json(
        { error: "Velg en gyldig kategori." },
        { status: 400 }
      );
    }

    const imageUrls = cleanArray(body.imageUrls)
      .map(cleanText)
      .filter(Boolean);

    const imageUrl =
      imageUrls[0] ||
      cleanText(body.imageUrl) ||
      null;

    const specifications =
      cleanArray(body.specifications);

    const options =
      cleanArray(body.options);

    const baseSlug =
      makeSlug(name) || "produkt";

    const id =
      `${baseSlug}-${Date.now()}`;

    const slug =
      `${baseSlug}-${Date.now()}`;

    const { data, error } = await s
      .from("products")
      .insert({
        id,
        slug,
        name,

        category_id:
          category.id,

        category:
          category.name,

        description:
          cleanText(body.description),

        dimensions:
          cleanText(body.dimensions),

        base_price_ore:
          Math.round(
            Number(body.basePriceOre)
          ),

        image_url:
          imageUrl,

        image_urls:
          imageUrls,

        specifications,

        options,

        active:
          body.active !== false,
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
  } catch (error) {
    console.error(
      "ADMIN PRODUCT CREATE ERROR:",
      error
    );

    return NextResponse.json(
      { error: "Produktet kunne ikke opprettes." },
      { status: 500 }
    );
  }
}

export async function PATCH(req) {
  try {
    if (!(await hasPermission("canManageProducts"))) {
      return NextResponse.json(
        { error: "Du har ikke tilgang til å administrere produkter." },
        { status: 403 }
      );
    }

    const body = await req.json();

    const id =
      cleanText(body.id);

    const name =
      cleanText(body.name);

    if (!id) {
      return NextResponse.json(
        { error: "Produkt mangler." },
        { status: 400 }
      );
    }

    if (!name) {
      return NextResponse.json(
        { error: "Produktet må ha et navn." },
        { status: 400 }
      );
    }

    if (!validPrice(body.basePriceOre)) {
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

    const category = await getCategory(
      s,
      body.categoryId
    );

    if (!category) {
      return NextResponse.json(
        { error: "Velg en gyldig kategori." },
        { status: 400 }
      );
    }

    const imageUrls = cleanArray(body.imageUrls)
      .map(cleanText)
      .filter(Boolean);

    const imageUrl =
      imageUrls[0] ||
      cleanText(body.imageUrl) ||
      null;

    const specifications =
      cleanArray(body.specifications);

    const options =
      cleanArray(body.options);

    const { data, error } = await s
      .from("products")
      .update({
        name,

        category_id:
          category.id,

        category:
          category.name,

        description:
          cleanText(body.description),

        dimensions:
          cleanText(body.dimensions),

        base_price_ore:
          Math.round(
            Number(body.basePriceOre)
          ),

        image_url:
          imageUrl,

        image_urls:
          imageUrls,

        specifications,

        options,

        active:
          body.active !== false,
      })
      .eq("id", id)
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
  } catch (error) {
    console.error(
      "ADMIN PRODUCT UPDATE ERROR:",
      error
    );

    return NextResponse.json(
      { error: "Produktet kunne ikke lagres." },
      { status: 500 }
    );
  }
}
