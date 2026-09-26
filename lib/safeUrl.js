export function safeSiteHref(value){
 const href=String(value||"").trim();
 if(!href)return "";
 if(/^#[A-Za-z0-9_-]+$/.test(href))return href;
 if(href.startsWith("/")&&!href.startsWith("//")&&!href.includes("\\")&&!/[\u0000-\u001f\u007f]/.test(href))return href;
 try{
  const url=new URL(href);
  return url.protocol==="https:"?url.toString():"";
 }catch{
  return "";
 }
}

export function safeHttpsUrl(value){
 const href=String(value||"").trim();
 if(!href)return "";
 try{
  const url=new URL(href);
  return url.protocol==="https:"?url.toString():"";
 }catch{
  return "";
 }
}
