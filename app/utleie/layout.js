export const metadata={
 title:{default:"Utleie av utstyr | Aadland Utleie",template:"%s | Aadland Utleie"},
 description:"Lei praktisk utstyr til prosjektet ditt hos Aadland Utleie i Bergen og omegn.",
 alternates:{canonical:"https://www.aadlandutleie.no"},
 icons:{icon:[{url:"/aadland-utleie-logo.png",type:"image/png"}]},
 twitter:{card:"summary_large_image",title:"Utleie av utstyr | Aadland Utleie",description:"Lei praktisk utstyr i Bergen og omegn.",images:["https://www.aadlandutleie.no/aadland-utleie-logo.png"]},
 openGraph:{
  images:[{url:"https://www.aadlandutleie.no/aadland-utleie-logo.png",width:1536,height:512,alt:"Aadland Utleie"}],
  type:"website",
  locale:"nb_NO",
  siteName:"Aadland Utleie",
  title:"Utleie av utstyr | Aadland Utleie",
  description:"Lei praktisk utstyr til prosjektet ditt hos Aadland Utleie i Bergen og omegn.",
  url:"https://www.aadlandutleie.no"
 }
};

export default function RentalLayout({children}){
 return children;
}
