const securityHeaders=[
  {key:"X-Content-Type-Options",value:"nosniff"},
  {key:"X-Frame-Options",value:"DENY"},
  {key:"Referrer-Policy",value:"strict-origin-when-cross-origin"},
  {key:"Permissions-Policy",value:"camera=(), microphone=(), geolocation=()"},
  {key:"Strict-Transport-Security",value:"max-age=63072000; includeSubDomains; preload"}
];

const privateHeaders=[
  {key:"Cache-Control",value:"private, no-store, max-age=0"},
  {key:"X-Robots-Tag",value:"noindex, nofollow, noarchive"}
];

const nextConfig={
  poweredByHeader:false,
  async headers(){
    return [
      {
        source:"/:path*",
        headers:securityHeaders
      },
      {
        source:"/admin/:path*",
        headers:privateHeaders
      },
      {
        source:"/min-side/:path*",
        headers:privateHeaders
      },
      {
        source:"/tilbud/:path*",
        headers:privateHeaders
      },
      {
        source:"/api/:path*",
        headers:privateHeaders
      }
    ];
  }
};

export default nextConfig;
