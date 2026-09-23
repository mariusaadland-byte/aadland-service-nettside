import crypto from "crypto";

function secret(){
 const value=process.env.ADMIN_PASSWORD_RESET_SECRET||process.env.SESSION_SECRET;
 if(!value)throw new Error("ADMIN_PASSWORD_RESET_SECRET eller SESSION_SECRET mangler.");
 return value;
}

function sign(payload){
 return crypto.createHmac("sha256",secret()).update(payload).digest("base64url");
}

export function createAdminPasswordResetToken({id,email,version},maxAgeSeconds=60*60){
 const payload=Buffer.from(JSON.stringify({
  purpose:"admin_password_reset",
  id:String(id||""),
  email:String(email||"").trim().toLowerCase(),
  version:String(version||""),
  exp:Math.floor(Date.now()/1000)+maxAgeSeconds
 })).toString("base64url");
 return payload+"."+sign(payload);
}

export function verifyAdminPasswordResetToken(token){
 try{
  const value=String(token||"");
  const dot=value.lastIndexOf(".");
  if(dot<1)return null;
  const payload=value.slice(0,dot);
  const signature=value.slice(dot+1);
  const expected=sign(payload);
  const a=Buffer.from(signature);
  const b=Buffer.from(expected);
  if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return null;
  const data=JSON.parse(Buffer.from(payload,"base64url").toString("utf8"));
  if(data?.purpose!=="admin_password_reset"||!data?.id||!data?.email||!data?.version||!data?.exp||data.exp<Math.floor(Date.now()/1000))return null;
  return {
   id:String(data.id),
   email:String(data.email).trim().toLowerCase(),
   version:String(data.version)
  };
 }catch{
  return null;
 }
}
