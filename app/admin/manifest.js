export default function manifest(){
 return {
  id:"/admin/mobil",
  name:"Aadland Service – Admin",
  short_name:"Aadland Admin",
  description:"Sikker mobiltilgang til Aadland Service-admin: oppdrag, fakturaer, tilbud og utleie.",
  start_url:"/admin/mobil",
  scope:"/admin/",
  display:"standalone",
  lang:"nb-NO",
  background_color:"#121921",
  theme_color:"#121921",
  icons:[
   {src:"/admin/icon",sizes:"512x512",type:"image/png",purpose:"any"},
   {src:"/admin/apple-icon",sizes:"180x180",type:"image/png",purpose:"any"}
  ]
 };
}
