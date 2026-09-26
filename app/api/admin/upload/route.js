import {sameOriginGuard} from "../../../../lib/requestGuard";
import { NextResponse } from "next/server";
import crypto from "crypto";
import {
  getAdminUser,
  hasPermission,
} from "../../../../lib/auth";
import { db } from "../../../../lib/supabase";
import { publicBucketPath } from "../../../../lib/storageImages";

export async function POST(req){ const originError=sameOriginGuard(req); if(originError)return originError;
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

    const maxSize = 4 * 1024 * 1024;

    if (file.size > maxSize) {
      return NextResponse.json(
        {
          error:
            "Bildet kan maksimalt være 4 MB.",
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
    const header = new Uint8Array(bytes.slice(0, 12));
    const isJpeg = header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
    const isPng = header.length >= 8 && header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47 && header[4] === 0x0d && header[5] === 0x0a && header[6] === 0x1a && header[7] === 0x0a;
    const isWebp = header.length >= 12 && String.fromCharCode(...header.slice(0,4)) === "RIFF" && String.fromCharCode(...header.slice(8,12)) === "WEBP";
    const signatureOk = file.type === "image/jpeg" ? isJpeg : file.type === "image/png" ? isPng : isWebp;
    if (!signatureOk) {
      return NextResponse.json(
        { error: "Filen ser ikke ut til å være et gyldig bilde." },
        { status: 400 }
      );
    }

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


export async function DELETE(req){ const originError=sameOriginGuard(req); if(originError)return originError;
  try {
    const currentUser=await getAdminUser();
    if(!currentUser)return NextResponse.json({error:"Ikke innlogget."},{status:401});
    if(!(await hasPermission("canManageProducts"))){
      return NextResponse.json({error:"Du har ikke tilgang til å slette produktbilder."},{status:403});
    }

    const body=await req.json().catch(()=>({}));
    const url=String(body.url||"").trim();
    const path=publicBucketPath(url,"product-images");
    if(!path)return NextResponse.json({error:"Bildet tilhører ikke Aadland Service sin produktlagring."},{status:400});

    const s=db();
    if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});

    const {error}=await s.storage.from("product-images").remove([path]);
    if(error){
      console.error("PRODUCT IMAGE DELETE ERROR:",error);
      return NextResponse.json({error:"Bildet kunne ikke slettes."},{status:500});
    }
    return NextResponse.json({ok:true});
  } catch(error) {
    console.error("PRODUCT IMAGE DELETE ERROR:",error);
    return NextResponse.json({error:"Bildet kunne ikke slettes."},{status:500});
  }
}
