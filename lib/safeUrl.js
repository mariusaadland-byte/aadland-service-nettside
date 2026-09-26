export function safeSiteHref(value){
 const href=String(value||"").trim();
 if(!href)return "";
 if(/^#[A-Za-z0-9_-]+$/.test(href))return href;
 if(href.startsWith("/")&&!href.startsWith("//"))return href;
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
