import "./globals.css";
export const metadata={
 metadataBase:new URL("https://www.aadland-service.no"),
 title:{default:"Aadland Service | Bygg, oppussing og uteområder i Bergen",template:"%s | Aadland Service"},
 description:"Aadland Service hjelper privatkunder i Bergen og omegn med bygg, oppussing, vedlikehold, uteområder og produkter på bestilling.",
 openGraph:{title:"Aadland Service | Bygg, oppussing og uteområder i Bergen",description:"Lokalt håndverk i Bergen og omegn – bygg, oppussing, vedlikehold, uteområder og produkter på bestilling.",url:"https://www.aadland-service.no",siteName:"Aadland Service",locale:"nb_NO",type:"website"},
 robots:{index:true,follow:true},
};
export default function RootLayout({children}){return <html lang="nb"><body>{children}</body></html>}