const text=`User-agent: *
Allow: /
Disallow: /admin
Disallow: /api
Disallow: /min-side
Disallow: /tilbud

Sitemap: https://www.aadlandutleie.no/sitemap.xml
Host: https://www.aadlandutleie.no
`;

export async function GET(){
 return new Response(text,{
  headers:{
   "Content-Type":"text/plain; charset=utf-8",
   "Cache-Control":"public, s-maxage=3600, stale-while-revalidate=86400"
  }
 });
}
