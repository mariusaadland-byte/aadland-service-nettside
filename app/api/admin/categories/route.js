import { NextResponse } from "next/server";

import {
  getAdminUser,
  hasPermission,
} from "../../../../lib/auth";

import { db } from "../../../../lib/supabase";

async function requireCategoryAccess() {
  const currentUser =
    await getAdminUser();

  if (!currentUser) {
    return {
      error: NextResponse.json(
        {
          error:
            "Ikke innlogget.",
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
  return String(
    value || ""
  ).trim();
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
      { status: 500 }
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
      { status: 500 }
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
      { status: 500 }
    );
  }

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

  if (!body.id) {
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
      { status: 500 }
    );
  }

  const { error } =
    await s
      .from("categories")
      .delete()
      .eq("id", body.id);

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

  return NextResponse.json({
    ok: true,
  });
}
