export default function robots(){
  const base="https://www.aadland-service.no";
  return {
    rules:[{
      userAgent:"*",
      allow:"/",
      disallow:["/admin","/api","/min-side","/tilbud"]
    }],
    sitemap:base+"/sitemap.xml",
    host:base
  };
}
