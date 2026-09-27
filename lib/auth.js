import "server-only";
import crypto from "crypto";
import { cookies } from "next/headers";
import { db } from "./supabase";
import {createSessionVersion,readSessionVersion,sameSessionVersion,SESSION_VERSION_FIELD} from "./sessionVersion";

const COOKIE = "aadland_admin";
const SESSION_MAX_AGE=60*60*24*14;

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error("SESSION_SECRET mangler.");
  return value;
}

function sign(userId,version,expiresAt) {
  return crypto
    .createHmac("sha256", secret())
    .update("admin:"+userId+":"+version+":"+expiresAt)
    .digest("hex");
}

function parseSession(value){
  const parts=String(value||"").split(".");
  if(parts.length!==4)return null;
  const [userId,version,expiresRaw,signature]=parts;
  const expiresAt=Number(expiresRaw);
  if(!userId||!version||!signature||!/^[a-f0-9]{48}$/i.test(version)||!Number.isInteger(expiresAt))return null;
  if(expiresAt<=Math.floor(Date.now()/1000))return null;
  const normalized=version.toLowerCase();
  const expected=sign(userId,normalized,expiresAt);
  const a=Buffer.from(signature);
  const b=Buffer.from(expected);
  if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return null;
  return {userId,version:normalized,expiresAt};
}

async function ensureSessionVersion(s,userId){
  const {data,error}=await s.auth.admin.getUserById(userId);
  const user=data?.user;
  if(error||!user)throw new Error("Kunne ikke opprette sikker innlogging.");
  let version=readSessionVersion(user);
  if(version)return version;
  version=createSessionVersion();
  const metadata={...(user.app_metadata||{}),[SESSION_VERSION_FIELD]:version};
  const {error:updateError}=await s.auth.admin.updateUserById(userId,{app_metadata:metadata});
  if(updateError)throw new Error("Kunne ikke opprette sikker innlogging.");
  return version;
}

export async function setAdminCookie(userId) {
  const s=db();
  if(!s)throw new Error("Databasen er ikke tilgjengelig.");
  const version=await ensureSessionVersion(s,userId);
  const expiresAt=Math.floor(Date.now()/1000)+SESSION_MAX_AGE;
  const value = `${userId}.${version}.${expiresAt}.${sign(userId,version,expiresAt)}`;
  const c = await cookies();
  c.set(COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

async function readAdminSession(){
  const c=await cookies();
  return parseSession(c.get(COOKIE)?.value||"");
}

export async function getAdminUser() {
  const session=await readAdminSession();
  if(!session)return null;

  const s=db();
  if(!s)return null;

  const [adminResult,authResult]=await Promise.all([
    s.from("admin_users")
      .select("id,email,name,role,can_view_orders,can_update_orders,can_manage_products,can_manage_users,active")
      .eq("id",session.userId)
      .single(),
    s.auth.admin.getUserById(session.userId)
  ]);

  const data=adminResult.data;
  const authUser=authResult.data?.user;
  const currentVersion=readSessionVersion(authUser);

  if(adminResult.error||!data||!data.active||authResult.error||!authUser||!sameSessionVersion(session.version,currentVersion)){
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

export async function getAdminUserId() {
  return (await getAdminUser())?.id||null;
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
