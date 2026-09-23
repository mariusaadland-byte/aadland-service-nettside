export function publicBucketPath(value,bucket){
 try{
  const url=new URL(String(value||""));
  const marker="/storage/v1/object/public/"+bucket+"/";
  const index=url.pathname.indexOf(marker);
  if(index<0)return null;
  const raw=url.pathname.slice(index+marker.length);
  const path=decodeURIComponent(raw);
  if(!path||path.startsWith("/")||path.includes(".."))return null;
  return path;
 }catch{
  return null;
 }
}

export async function removePublicBucketUrls(s,bucket,urls){
 const paths=[...new Set((Array.isArray(urls)?urls:[]).map(url=>publicBucketPath(url,bucket)).filter(Boolean))];
 if(!paths.length)return {removed:0};
 const {error}=await s.storage.from(bucket).remove(paths);
 if(error){
  console.error("STORAGE CLEANUP ERROR",bucket,error);
  return {removed:0,error};
 }
 return {removed:paths.length};
}
