import crypto from "crypto";
import { cookies } from "next/headers";
import { db } from "./supabase";

const COOKIE = "aadland_admin";

function secret() {
  return process.env.SESSION_SECRET || "CHANGE-ME";
}

function sign(userId) {
  return crypto
    .createHmac("sha256", secret())
    .update(userId)
    .digest("hex");
}

export async function setAdminCookie(userId) {
  const value = `${userId}.${sign(userId)}`;

  const c = await cookies();

  c.set(COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });

  console.log("AUTH DEBUG: cookie satt");
}

export async function getAdminUserId() {
  const c = await cookies();
  const value = c.get(COOKIE)?.value || "";

  if (!value) {
    console.log("AUTH DEBUG: cookie mangler");
    return null;
  }

  const dot = value.indexOf(".");

  if (dot === -1) {
    console.log("AUTH DEBUG: ugyldig cookie-format");
    return null;
  }

  const userId = value.slice(0, dot);
  const signature = value.slice(dot + 1);

  if (!userId || !signature) {
    console.log("AUTH DEBUG: cookie mangler userId eller signatur");
    return null;
  }

  const expected = sign(userId);

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);

  if (a.length !== b.length) {
    console.log("AUTH DEBUG: signaturlengde stemmer ikke");
    return null;
  }

  if (!crypto.timingSafeEqual(a, b)) {
    console.log("AUTH DEBUG: cookie-signatur stemmer ikke");
    return null;
  }

  console.log("AUTH DEBUG: cookie er gyldig");

  return userId;
}

export async function getAdminUser() {
  const userId = await getAdminUserId();

  if (!userId) {
    console.log("AUTH DEBUG: ingen gyldig userId");
    return null;
  }

  const s = db();

  if (!s) {
    console.log("AUTH DEBUG: db() returnerte null");
    return null;
  }

  const { data, error } = await s
    .from("admin_users")
    .select(
      "id,email,name,role,can_view_orders,can_update_orders,can_manage_products,can_manage_users,active"
    )
    .eq("id", userId)
    .single();

  if (error) {
    console.log("AUTH DEBUG: admin_users databasefeil", {
      code: error.code,
      message: error.message,
    });
    return null;
  }

  if (!data) {
    console.log("AUTH DEBUG: admin-bruker ikke funnet");
    return null;
  }

  if (!data.active) {
    console.log("AUTH DEBUG: admin-bruker er deaktivert");
    return null;
  }

  console.log("AUTH DEBUG: admin-bruker godkjent", {
    role: data.role,
    active: data.active,
  });

  return {
    id: data.id,
    email: data.email,
    name: data.name,
    role: data.role,
    canViewOrders: Boolean(data.can_view_orders),
    canUpdateOrders: Boolean(data.can_update_orders),
    canManageProducts: Boolean(data.can_manage_products),
    canManageUsers: Boolean(data.can_manage_users),
    active: Boolean(data.active),
  };
}

export async function isAdmin() {
  return Boolean(await getAdminUser());
}

export async function hasPermission(permission) {
  const user = await getAdminUser();

  if (!user) return false;

  if (user.role === "owner") return true;

  return Boolean(user[permission]);
}

export async function clearAdminCookie() {
  const c = await cookies();
  c.delete(COOKIE);
}
