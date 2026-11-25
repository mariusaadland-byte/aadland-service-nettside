// Public media is rendered in <img> and CSS background-image: reject unsafe schemes,
// malformed URLs, control characters and CSS-string terminators.
export function safePublicImageUrl(value){
 const source=String(value??"").trim();
 if(!source||/["'()\u0000-\u001f\u007f\\]/.test(source))return "";
 if(source.startsWith("/")&&!source.startsWith("//")){
  if(!/^\/[a-zA-Z0-9_~.%!$&*+,;=:@/?#-]*$/.test(source))return "";
  return source;
 }
 try{
  const url=new URL(source);
  if(url.protocol!=="https:"||url.username||url.password)return "";
  return url.toString();
 }catch{
  return "";
 }
}
