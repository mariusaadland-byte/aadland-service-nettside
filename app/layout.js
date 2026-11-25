import "./globals.css";
import "./accessibility.css";
import "./formContrast.css";

const siteTitle="Aadland Service | Bygg, oppussing og uteområder i Bergen";
const siteDescription="Aadland Service hjelper privatkunder i Bergen og omegn med bygg, oppussing, vedlikehold, uteområder og produkter på bestilling.";

export const viewport={
 width:"device-width",
 initialScale:1,
 themeColor:"#111111",
 colorScheme:"dark"
};

export const metadata={
 metadataBase:new URL("https://www.aadland-service.no"),
 title:{default:siteTitle,template:"%s | Aadland Service"},
 description:siteDescription,
 manifest:"/manifest.webmanifest",
 openGraph:{
  title:siteTitle,
  description:"Lokalt håndverk i Bergen og omegn – bygg, oppussing, vedlikehold, uteområder og produkter på bestilling.",
  url:"https://www.aadland-service.no",
  siteName:"Aadland Service",
  locale:"nb_NO",
  type:"website"
 },
 twitter:{
  card:"summary_large_image",
  title:siteTitle,
  description:siteDescription
 },
 robots:{index:true,follow:true}
};

export default function RootLayout({children}){
 return <html lang="nb">
  <body>{children}</body>
 </html>
}