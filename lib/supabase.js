import { createClient } from "@supabase/supabase-js";

export function db() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return null;
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
    },
  });
}

export function fromDbProduct(p) {
  const imageUrls =
    Array.isArray(p.image_urls) &&
    p.image_urls.length
      ? p.image_urls
      : p.image_url
      ? [p.image_url]
      : [];

  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    category: p.category,
    eyebrow: p.eyebrow,
    description: p.description,

    basePriceOre:
      p.base_price_ore,

    options:
      Array.isArray(p.options)
        ? p.options
        : [],

    imageUrl:
      p.image_url ||
      imageUrls[0] ||
      null,

    imageUrls,

    dimensions:
      p.dimensions || "",

    specifications:
      Array.isArray(
        p.specifications
      )
        ? p.specifications
        : [],

    icon: p.icon,
    accent: p.accent,
    featured: p.featured,
    active: p.active,
  };
}
