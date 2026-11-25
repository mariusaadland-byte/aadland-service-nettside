export const metadata={
 metadataBase:new URL("https://www.aadlandutleie.no"),
 manifest:"/rental-manifest.webmanifest",
 title:{default:"Verktøyutleie i Bergen | Aadland Utleie",template:"%s | Aadland Utleie"},
 description:"Lei verktøy og utstyr til prosjektet ditt i Bergen og omegn. Se leiepris, kalender og tilgjengelighet hos Aadland Utleie.",
 alternates:{canonical:"https://www.aadlandutleie.no"},
 icons:{icon:[{url:"/aadland-utleie-logo.png",type:"image/png"}]},
 twitter:{card:"summary_large_image",title:"Verktøyutleie i Bergen | Aadland Utleie",description:"Lei verktøy og utstyr i Bergen og omegn.",images:["https://www.aadlandutleie.no/aadland-utleie-logo.png"]},
 openGraph:{
  images:[{url:"https://www.aadlandutleie.no/aadland-utleie-logo.png",width:1536,height:512,alt:"Aadland Utleie"}],
  type:"website",
  locale:"nb_NO",
  siteName:"Aadland Utleie",
  title:"Verktøyutleie i Bergen | Aadland Utleie",
  description:"Lei verktøy og utstyr til prosjektet ditt i Bergen og omegn. Se leiepris, kalender og tilgjengelighet hos Aadland Utleie.",
  url:"https://www.aadlandutleie.no"
 }
};

export default function RentalLayout({children}){
 return <>{children}</>;
}
