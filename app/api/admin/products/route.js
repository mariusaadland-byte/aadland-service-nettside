import { NextResponse } from "next/server";
import { db, fromDbProduct } from "../../../../lib/supabase";
import { hasPermission } from "../../../../lib/auth";
import { removePublicBucketUrls } from "../../../../lib/storageImages";

function cleanText(value) {
  return String(value || "").trim();
}

function validPrice(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 100000000;
}

function cleanArray(value) {
  return Array.isArray(value) ? value : [];
}

function finiteOptional(value,{integer=false,max=10000000}={}) {
  if (value === undefined || value === null || value === "") return null;
  const n=Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max || (integer && !Number.isInteger(n))) return undefined;
  return n;
}

function validateProductExtras(body) {
  const images=cleanArray(body.imageUrls);
  const specs=cleanArray(body.specifications);
  const options=cleanArray(body.options);
  if(images.length>30||images.some(v=>cleanText(v).length>2000)) return "For mange bilder eller for lang bildeadresse.";
  if(cleanText(body.imageUrl).length>2000) return "Bildeadressen er for lang.";
  if(specs.length>50||JSON.stringify(specs).length>20000) return "Produktspesifikasjonene er for omfattende.";
  if(options.length>20||JSON.stringify(options).length>30000) return "Produktvalgene er for omfattende.";
  const nums=[
    finiteOptional(body.stockQuantity,{integer:true,max:1000000}),
    finiteOptional(body.shippingPriceOre,{integer:true,max:100000000}),
    finiteOptional(body.weightGrams,{integer:true,max:10000000}),
    finiteOptional(body.shippingLengthCm,{max:100000}),
    finiteOptional(body.shippingWidthCm,{max:100000}),
    finiteOptional(body.shippingHeightCm,{max:100000})
  ];
  if(nums.some(v=>v===undefined)) return "Et eller flere lager- eller fraktfelt har ugyldig verdi.";
  return null;
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
        { status: 503 }
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

    if (name.length > 160 || cleanText(body.description).length > 5000 || cleanText(body.dimensions).length > 500 || cleanText(body.leadTimeText).length > 500) return NextResponse.json({ error: "Et eller flere produktfelt er for lange." }, { status: 400 });

    const extraError = validateProductExtras(body);
    if (extraError) return NextResponse.json({ error: extraError }, { status: 400 });

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
        { status: 503 }
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
        updated_at: new Date().toISOString(),
        inventory_mode: body.inventoryMode === "stock" ? "stock" : "made_to_order",
        stock_quantity: finiteOptional(body.stockQuantity,{integer:true,max:1000000}) ?? 0,
        restock_date: body.restockDate || null,
        lead_time_text: cleanText(body.leadTimeText),
        shippable: body.shippable === true,
        shipping_price_ore: finiteOptional(body.shippingPriceOre,{integer:true,max:100000000}) ?? 0,
        weight_grams: finiteOptional(body.weightGrams,{integer:true,max:10000000}),
        shipping_length_cm: finiteOptional(body.shippingLengthCm,{max:100000}),
        shipping_width_cm: finiteOptional(body.shippingWidthCm,{max:100000}),
        shipping_height_cm: finiteOptional(body.shippingHeightCm,{max:100000}),
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

    if (name.length > 160 || cleanText(body.description).length > 5000 || cleanText(body.dimensions).length > 500 || cleanText(body.leadTimeText).length > 500) return NextResponse.json({ error: "Et eller flere produktfelt er for lange." }, { status: 400 });

    const extraError = validateProductExtras(body);
    if (extraError) return NextResponse.json({ error: extraError }, { status: 400 });

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
        { status: 503 }
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

    const {data:existingProduct,error:existingProductError}=await s.from("products").select("id,image_url,image_urls").eq("id",id).maybeSingle();
    if(existingProductError){
      console.error("ADMIN PRODUCT LOOKUP ERROR:",existingProductError);
      return NextResponse.json({error:"Produktet kunne ikke kontrolleres."},{status:500});
    }
    if(!existingProduct)return NextResponse.json({error:"Produktet ble ikke funnet."},{status:404});
    const oldProductImages=[
      ...(Array.isArray(existingProduct.image_urls)?existingProduct.image_urls:[]),
      existingProduct.image_url
    ].map(cleanText).filter(Boolean);

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
        updated_at: new Date().toISOString(),
        inventory_mode: body.inventoryMode === "stock" ? "stock" : "made_to_order",
        stock_quantity: finiteOptional(body.stockQuantity,{integer:true,max:1000000}) ?? 0,
        restock_date: body.restockDate || null,
        lead_time_text: cleanText(body.leadTimeText),
        shippable: body.shippable === true,
        shipping_price_ore: finiteOptional(body.shippingPriceOre,{integer:true,max:100000000}) ?? 0,
        weight_grams: finiteOptional(body.weightGrams,{integer:true,max:10000000}),
        shipping_length_cm: finiteOptional(body.shippingLengthCm,{max:100000}),
        shipping_width_cm: finiteOptional(body.shippingWidthCm,{max:100000}),
        shipping_height_cm: finiteOptional(body.shippingHeightCm,{max:100000}),
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

    const keptImages=new Set([...(imageUrls||[]),imageUrl].filter(Boolean));
    const removedImages=oldProductImages.filter(url=>!keptImages.has(url));
    if(removedImages.length)await removePublicBucketUrls(s,"product-images",removedImages);

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


export async function DELETE(req) {
  try {
    if (!(await hasPermission("canManageProducts"))) {
      return NextResponse.json(
        { error: "Du har ikke tilgang til å administrere produkter." },
        { status: 403 }
      );
    }

    const body=await req.json().catch(()=>({}));
    const id=cleanText(body.id);
    if(!id)return NextResponse.json({error:"Produkt mangler."},{status:400});

    const s=db();
    if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});

    const {data:product,error:productError}=await s
      .from("products")
      .select("id,name,image_url,image_urls")
      .eq("id",id)
      .maybeSingle();

    if(productError){
      console.error("ADMIN PRODUCT DELETE LOOKUP ERROR:",productError);
      return NextResponse.json({error:"Produktet kunne ikke kontrolleres."},{status:500});
    }
    if(!product)return NextResponse.json({error:"Produktet ble ikke funnet."},{status:404});

    const {count,error:usageError}=await s
      .from("orders")
      .select("id",{count:"exact",head:true})
      .contains("items",[{productId:id}]);

    if(usageError){
      console.error("ADMIN PRODUCT ORDER USAGE ERROR:",usageError);
      return NextResponse.json({error:"Kunne ikke kontrollere om produktet finnes i tidligere bestillinger."},{status:500});
    }

    if((count||0)>0){
      return NextResponse.json({
        error:`Produktet finnes i ${count} tidligere bestilling${count===1?"":"er"} og kan derfor ikke slettes. Skjul produktet i stedet.`
      },{status:409});
    }

    const {error:deleteError}=await s.from("products").delete().eq("id",id);
    if(deleteError){
      console.error("ADMIN PRODUCT DELETE ERROR:",deleteError);
      return NextResponse.json({error:"Produktet kunne ikke slettes."},{status:500});
    }

    const urls=[
      ...(Array.isArray(product.image_urls)?product.image_urls:[]),
      product.image_url
    ].map(cleanText).filter(Boolean);
    if(urls.length)await removePublicBucketUrls(s,"product-images",urls);

    return NextResponse.json({ok:true});
  } catch (error) {
    console.error("ADMIN PRODUCT DELETE ERROR:",error);
    return NextResponse.json({error:"Produktet kunne ikke slettes."},{status:500});
  }
}
