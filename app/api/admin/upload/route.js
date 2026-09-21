import { NextResponse } from "next/server";
import crypto from "crypto";
import {
  getAdminUser,
  hasPermission,
} from "../../../../lib/auth";
import { db } from "../../../../lib/supabase";

export async function POST(req) {
  try {
    const currentUser = await getAdminUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: "Ikke innlogget." },
        { status: 401 }
      );
    }

    if (
      !(await hasPermission(
        "canManageProducts"
      ))
    ) {
      return NextResponse.json(
        {
          error:
            "Du har ikke tilgang til å laste opp produktbilder.",
        },
        { status: 403 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json(
        { error: "Velg et bilde." },
        { status: 400 }
      );
    }

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        {
          error:
            "Bildet må være JPG, PNG eller WebP.",
        },
        { status: 400 }
      );
    }

    const maxSize = 10 * 1024 * 1024;

    if (file.size > maxSize) {
      return NextResponse.json(
        {
          error:
            "Bildet kan maksimalt være 10 MB.",
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

    const extension = file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg";

    const fileName =
      `${crypto.randomUUID()}.${extension}`;

    const bytes = await file.arrayBuffer();

    const { error: uploadError } =
      await s.storage
        .from("product-images")
        .upload(fileName, bytes, {
          contentType: file.type,
          upsert: false,
        });

    if (uploadError) {
      console.error(
        "PRODUCT IMAGE UPLOAD ERROR:",
        uploadError
      );

      return NextResponse.json(
        {
          error:
            "Bildet kunne ikke lastes opp.",
        },
        { status: 500 }
      );
    }

    const { data } = s.storage
      .from("product-images")
      .getPublicUrl(fileName);

    return NextResponse.json({
      ok: true,
      url: data.publicUrl,
      path: fileName,
    });
  } catch (error) {
    console.error(
      "PRODUCT IMAGE UPLOAD ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Bildet kunne ikke lastes opp.",
      },
      { status: 500 }
    );
  }
}
