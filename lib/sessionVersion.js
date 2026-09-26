import crypto from "crypto";

export const SESSION_VERSION_FIELD="aadland_session_version";

export function createSessionVersion(){
 return crypto.randomBytes(24).toString("hex");
}

export function readSessionVersion(user){
 const value=String(user?.app_metadata?.[SESSION_VERSION_FIELD]||"");
 return /^[a-f0-9]{48}$/i.test(value)?value.toLowerCase():"";
}

export function sameSessionVersion(a,b){
 if(!a||!b)return false;
 const left=Buffer.from(String(a));
 const right=Buffer.from(String(b));
 return left.length===right.length&&crypto.timingSafeEqual(left,right);
}
