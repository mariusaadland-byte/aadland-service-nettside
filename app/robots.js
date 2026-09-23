export default function robots(){
  const base="https://www.aadland-service.no";
  return {
    rules:[
      {
        userAgent:"*",
        allow:"/",
        disallow:[
          "/admin/",
          "/min-side/",
          "/tilbud/"
        ]
      }
    ],
    sitemap:base+"/sitemap.xml",
    host:base
  };
}
