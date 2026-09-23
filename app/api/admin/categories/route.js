import { NextResponse } from "next/server";

import {
  getAdminUser,
  hasPermission,
} from "../../../../lib/auth";

import { db } from "../../../../lib/supabase";
import { removePublicBucketUrls } from "../../../../lib/storageImages";

async function requireCategoryAccess() {
  const currentUser =
    await getAdminUser();

  if (!currentUser) {
    return {
      error: NextResponse.json(
        {
          error: "Ikke innlogget.",
        },
        { status: 401 }
      ),
    };
  }

  if (
    !(await hasPermission(
      "canManageProducts"
    ))
  ) {
    return {
      error: NextResponse.json(
        {
          error:
            "Du har ikke tilgang til å administrere kategorier.",
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

function makeSlug(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(
      /[^a-z0-9]+/g,
      "-"
    )
    .replace(/^-|-$/g, "");
}

export async function GET() {
  const access =
    await requireCategoryAccess();

  if (access.error) {
    return access.error;
  }

  const s = db();

  if (!s) {
    return NextResponse.json(
      {
        error:
          "Databasen er ikke tilgjengelig.",
      },
      { status: 503 }
    );
  }

  const { data, error } =
    await s
      .from("categories")
      .select("*")
      .order(
        "sort_order",
        { ascending: true }
      )
      .order(
        "created_at",
        { ascending: true }
      );

  if (error) {
    console.error(
      "ADMIN CATEGORIES GET ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Kategoriene kunne ikke hentes.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    categories:
      data || [],
  });
}

export async function POST(req) {
  const access =
    await requireCategoryAccess();

  if (access.error) {
    return access.error;
  }

  const body =
    await req.json();

  const name =
    cleanText(body.name);

  if (name.length > 160 || cleanText(body.description).length > 5000 || cleanText(body.imageUrl).length > 2000) return NextResponse.json({error:"Et eller flere kategorifelt er for lange."},{status:400});

  if (!name) {
    return NextResponse.json(
      {
        error:
          "Kategorien må ha et navn.",
      },
      { status: 400 }
    );
  }

  const baseSlug =
    makeSlug(name) ||
    "kategori";

  const slug =
    `${baseSlug}-${Date.now()}`;

  const sortOrder =
    Number.isFinite(
      Number(
        body.sortOrder
      )
    )
      ? Math.round(
          Number(
            body.sortOrder
          )
        )
      : 0;

  const s = db();

  if (!s) {
    return NextResponse.json(
      {
        error:
          "Databasen er ikke tilgjengelig.",
      },
      { status: 503 }
    );
  }

  const { data, error } =
    await s
      .from("categories")
      .insert({
        name,
        slug,

        description:
          cleanText(
            body.description
          ) || null,

        image_url:
          cleanText(
            body.imageUrl
          ) || null,

        sort_order:
          sortOrder,

        active:
          body.active !==
          false,
      })
      .select("*")
      .single();

  if (error) {
    console.error(
      "ADMIN CATEGORY CREATE ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Kategorien kunne ikke opprettes.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    category: data,
  });
}

export async function PATCH(req) {
  const access =
    await requireCategoryAccess();

  if (access.error) {
    return access.error;
  }

  const body =
    await req.json();

  if (!body.id) {
    return NextResponse.json(
      {
        error:
          "Kategori mangler.",
      },
      { status: 400 }
    );
  }

  const name =
    cleanText(body.name);

  if (name.length > 160 || cleanText(body.description).length > 5000 || cleanText(body.imageUrl).length > 2000) return NextResponse.json({error:"Et eller flere kategorifelt er for lange."},{status:400});

  if (!name) {
    return NextResponse.json(
      {
        error:
          "Kategorien må ha et navn.",
      },
      { status: 400 }
    );
  }

  const sortOrder =
    Number.isFinite(
      Number(
        body.sortOrder
      )
    )
      ? Math.round(
          Number(
            body.sortOrder
          )
        )
      : 0;

  const s = db();

  if (!s) {
    return NextResponse.json(
      {
        error:
          "Databasen er ikke tilgjengelig.",
      },
      { status: 503 }
    );
  }

  const { data: existing, error: existingError } = await s.from("categories").select("name,image_url").eq("id", body.id).maybeSingle();
  if (existingError) {
    console.error("CATEGORY LOOKUP ERROR:",existingError);
    return NextResponse.json({error:"Kategorien kunne ikke kontrolleres."},{status:500});
  }
  if (!existing) return NextResponse.json({error:"Kategorien ble ikke funnet."},{status:404});

  const { data, error } =
    await s
      .from("categories")
      .update({
        name,

        description:
          cleanText(
            body.description
          ) || null,

        image_url:
          cleanText(
            body.imageUrl
          ) || null,

        sort_order:
          sortOrder,

        active:
          body.active !==
          false,

        updated_at:
          new Date()
            .toISOString(),
      })
      .eq("id", body.id)
      .select("*")
      .single();

  if (!error && existing.name !== name) {
    const {error: productUpdateError}=await s.from("products").update({category:name,updated_at:new Date().toISOString()}).eq("category_id",body.id);
    if(productUpdateError) {
      console.error("CATEGORY PRODUCT NAME SYNC ERROR:",productUpdateError);
      const {error: rollbackError}=await s.from("categories").update({name:existing.name,updated_at:new Date().toISOString()}).eq("id",body.id);
      if(rollbackError) console.error("CATEGORY NAME ROLLBACK ERROR:",rollbackError);
      return NextResponse.json({error:"Kategorien ble ikke lagret fordi produktene ikke kunne oppdateres. Prøv igjen."},{status:500});
    }
  }

  if (error) {
    console.error(
      "ADMIN CATEGORY UPDATE ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Kategorien kunne ikke lagres.",
      },
      { status: 500 }
    );
  }

  const nextImage=cleanText(body.imageUrl)||null;
  if(existing.image_url&&existing.image_url!==nextImage){
    const cleanupResult=await removePublicBucketUrls(s,"product-images",[existing.image_url]);
    if(cleanupResult.error)console.error("CATEGORY IMAGE CLEANUP",cleanupResult.error);
  }

  return NextResponse.json({
    ok: true,
    category: data,
  });
}

export async function DELETE(req) {
  const access =
    await requireCategoryAccess();

  if (access.error) {
    return access.error;
  }

  const body =
    await req.json();

  const categoryId =
    cleanText(body.id);

  if (!categoryId) {
    return NextResponse.json(
      {
        error:
          "Kategori mangler.",
      },
      { status: 400 }
    );
  }

  const s = db();

  if (!s) {
    return NextResponse.json(
      {
        error:
          "Databasen er ikke tilgjengelig.",
      },
      { status: 503 }
    );
  }

  const { data: categoryForDelete, error: categoryLookupError }=await s
    .from("categories")
    .select("id,image_url")
    .eq("id",categoryId)
    .maybeSingle();

  if(categoryLookupError){
    console.error("CATEGORY DELETE LOOKUP ERROR:",categoryLookupError);
    return NextResponse.json({error:"Kategorien kunne ikke kontrolleres."},{status:500});
  }
  if(!categoryForDelete)return NextResponse.json({error:"Kategorien ble ikke funnet."},{status:404});

  const {
    count,
    error: countError,
  } = await s
    .from("products")
    .select("id", {
      count: "exact",
      head: true,
    })
    .eq(
      "category_id",
      categoryId
    );

  if (countError) {
    console.error(
      "CATEGORY PRODUCT COUNT ERROR:",
      countError
    );

    return NextResponse.json(
      {
        error:
          "Kunne ikke kontrollere om kategorien er i bruk.",
      },
      { status: 500 }
    );
  }

  if ((count || 0) > 0) {
    return NextResponse.json(
      {
        error:
          `Kategorien kan ikke slettes fordi ${count} produkt${count === 1 ? "" : "er"} ligger i kategorien. Flytt produktene til en annen kategori først.`,
      },
      { status: 409 }
    );
  }

  const { error } =
    await s
      .from("categories")
      .delete()
      .eq(
        "id",
        categoryId
      );

  if (error) {
    console.error(
      "ADMIN CATEGORY DELETE ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Kategorien kunne ikke slettes.",
      },
      { status: 500 }
    );
  }

  if(categoryForDelete.image_url){
    const cleanupResult=await removePublicBucketUrls(s,"product-images",[categoryForDelete.image_url]);
    if(cleanupResult.error)console.error("CATEGORY DELETE IMAGE CLEANUP",cleanupResult.error);
  }

  return NextResponse.json({
    ok: true,
  });
}
