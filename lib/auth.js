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
}

export async function getAdminUserId() {
  const c = await cookies();
  const value = c.get(COOKIE)?.value || "";

  const dot = value.indexOf(".");
  if (dot === -1) return null;

  const userId = value.slice(0, dot);
  const signature = value.slice(dot + 1);

  if (!userId || !signature) return null;

  const expected = sign(userId);

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);

  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;

  return userId;
}

export async function getAdminUser() {
  const userId = await getAdminUserId();

  if (!userId) return null;

  const s = db();
  if (!s) return null;

  const { data, error } = await s
    .from("admin_users")
    .select(
      "id,email,name,role,can_view_orders,can_update_orders,can_manage_products,can_manage_users,active"
    )
    .eq("id", userId)
    .single();

  if (error || !data || !data.active) {
    return null;
  }

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

  if (user.role === "owner") {
    return true;
  }

  return Boolean(user[permission]);
}

export async function clearAdminCookie() {
  const c = await cookies();
  c.delete(COOKIE);
}
