export default function manifest(){
 return {
  name:"Aadland Service",
  short_name:"Aadland Service",
  description:"Bygg, oppussing, vedlikehold, uteområder og produkter på bestilling i Bergen og omegn.",
  start_url:"/",
  display:"standalone",
  background_color:"#111111",
  theme_color:"#111111",
  lang:"nb",
  icons:[
   {
    src:"/icon",
    sizes:"512x512",
    type:"image/png",
    purpose:"any"
   }
  ]
 };
}
