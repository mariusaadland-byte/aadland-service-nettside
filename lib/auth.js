import crypto from "crypto";
import { cookies } from "next/headers";

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

export async function isAdmin() {
  return Boolean(await getAdminUserId());
}

export async function clearAdminCookie() {
  (await cookies()).delete(COOKIE);
}
