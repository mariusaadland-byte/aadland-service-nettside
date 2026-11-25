import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
const imgSource=read("lib/publicContentImages.js");
const imageUrl=new Function(imgSource.replace(/^export /gm,"")+";return safePublicImageUrl;")();
assert.equal(imageUrl("/images/photo.webp"),"/images/photo.webp");
assert.equal(imageUrl("https://example.com/photo.jpg"),"https://example.com/photo.jpg");
for(const invalid of [
 "http://example.com/photo.jpg","javascript:alert(1)","data:image/svg+xml,<svg>",
 "//other-site/image.webp","/foo\";color:red","https://example.com/image.png);color:red",
 "https://user:secret@example.com/image.png","https://example.com/a\nb"
])assert.equal(imageUrl(invalid),"","Unsafe image URL: "+invalid);
const home=read("app/HomeClient.js");
const services=read("app/api/services/route.js");
const servicePage=read("app/tjenester/[slug]/page.js");
const projects=read("app/api/projects/route.js");
const projectGallery=read("app/prosjekter/page.js");
const admin=read("app/admin/AdminClient.js");
const safe=read("lib/safeUrl.js");
const hrefFn=home.match(/function serviceHref\(service\)\{[\s\S]*?\n\}/)?.[0];
assert.ok(hrefFn,"Service link helper must exist");
const safeSiteHref=new Function(safe.replace(/^export /gm,"")+";return safeSiteHref;")();
const serviceHref=new Function("safeSiteHref",hrefFn+";return serviceHref;")(safeSiteHref);
assert.equal(serviceHref({slug:"renovation",kind:"service",hasPage:true}),"/tjenester/renovation");
assert.equal(serviceHref({slug:"outdoor",kind:"service",hasPage:true}),"/tjenester/outdoor");
assert.equal(serviceHref({slug:"maintenance",kind:"service",hasPage:true}),"/tjenester/maintenance");
assert.equal(serviceHref({slug:"custom",kind:"service",hasPage:false}),"#befaring");
assert.equal(serviceHref({slug:"products",kind:"products",hasPage:false}),"/produkter");
assert.equal(serviceHref({slug:"survey",kind:"survey",hasPage:false}),"#befaring");
for(const slug of ["renovation","outdoor","maintenance"]){
 assert.ok(home.includes('slug:"'+slug+'",kind:"service",active:true,showInMenu:true,showInFooter:true,showOnHome:true,hasPage:true'));
 assert.ok(servicePage.includes(slug+":{title:"),"Existing detail page must exist");
}
assert.ok(home.includes("serviceActionLabel(service)"));
assert.ok(!home.includes("Se alle tjenester →"));
assert.ok(home.includes("Be om gratis befaring →"));
assert.ok(home.includes('const showServices=siteSettings.showServices!==false&&homeServices.length>0;'));
assert.ok(home.includes('data.services.length||data.configured===true'));
assert.ok(home.includes("{showServices&&<section id=\"tjenester\""));
assert.ok(home.includes("{showServices&&<section className=\"serviceStrip\""));
assert.ok(home.includes('imageUrl:safePublicImageUrl('));
assert.ok(services.includes('{services,configured}'));
assert.ok(services.includes('select("id",{count:"exact",head:true})'));
assert.ok(services.includes("no-store"));
assert.ok(servicePage.includes('data?.configured===false?fallback[slug]:null'),
 "Explicitly hidden services cannot fall back onto public static detail pages");
assert.ok(projects.includes("imageUrls:Array.isArray(p.image_urls)?p.image_urls.map(safePublicImageUrl).filter(Boolean):[]"));
assert.ok(projects.includes('block?.type==="image"?{...block,url:safePublicImageUrl(block.url)}:block'));
assert.ok(projectGallery.includes('projects.length>0?"Resultater vi er stolte av":"Tidligere oppdrag"'));
assert.ok(projectGallery.includes('Ingen prosjekter publisert ennå'));
assert.ok(admin.includes('["services", "Tjenester"]'));
assert.ok(admin.includes('["projects", "Tidligere oppdrag"]'));
console.log("S-28 offentlig innhold: riktige tjenestelenker, skjult innhold, ærlig tomt galleri og trygge bilde-URL-er bestått.");
