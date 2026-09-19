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

    categoryId:
      p.category_id || null,

    category:
      p.category,

    eyebrow:
      p.eyebrow,

    description:
      p.description,

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

    icon:
      p.icon,

    accent:
      p.accent,

    featured:
      p.featured,

    active:
      p.active,
  };
}

export function fromDbCategory(c) {
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,

    description:
      c.description || "",

    imageUrl:
      c.image_url || null,

    sortOrder:
      Number(c.sort_order) || 0,

    active:
      c.active !== false,
  };
}


export function fromDbService(s) {
  return {
    id: s.id,
    title: s.title,
    slug: s.slug,
    description: s.description || "",
    imageUrl: s.image_url || null,
    kind: s.kind || "service",
    active: s.active !== false,
    showOnHome: s.show_on_home !== false,
    showInMenu: s.show_in_menu !== false,
    showInFooter: s.show_in_footer !== false,
    hasPage: s.has_page === true,
    ctaLabel: s.cta_label || "Les mer",
    ctaHref: s.cta_href || "",
    formTitle: s.form_title || "Be om befaring",
    formPrompt: s.form_prompt || "Beskriv kort hva du ønsker hjelp med.",
    publishFrom: s.publish_from || null,
    publishUntil: s.publish_until || null,
    sortOrder: Number(s.sort_order) || 0,
  };
}
