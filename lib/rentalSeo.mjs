export const rentalStructuredData={
 "@context":"https://schema.org","@type":"LocalBusiness","@id":"https://www.aadlandutleie.no/#utleie",
 name:"Aadland Utleie",url:"https://www.aadlandutleie.no/",logo:"https://www.aadlandutleie.no/aadland-utleie-logo.png",
 image:"https://www.aadlandutleie.no/aadland-utleie-logo.png",
 description:"Verktøy- og utstyrsutleie i Bergen og omegn.",
 telephone:"+4747154898",email:"post@aadland-service.no",areaServed:"Bergen og omegn",
 parentOrganization:{"@type":"Organization",name:"Aadland Service",url:"https://www.aadland-service.no",vatID:"NO937781873MVA"}
};
export function rentalProductMetadata(item){
 const name=String(item.name||"Utstyr").trim();
 const description=String(item.description||"").replace(/\s+/g," ").trim();
 const fallback="Lei "+name+" hos Aadland Utleie i Bergen. Se pris og tilgjengelige leiedatoer.";
 const title="Lei "+name+" i Bergen";
 const url="https://www.aadlandutleie.no/utleie/"+encodeURIComponent(item.slug);
 let image="https://www.aadlandutleie.no/aadland-utleie-logo.png";
 try{const u=new URL(item.image_urls?.[0]);if(u.protocol==="https:")image=u.href;}catch{}
 return {title,description:(description?description+" – Utleie i Bergen.":fallback).slice(0,160),url,image};
}
